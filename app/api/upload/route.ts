import { randomUUID } from "node:crypto";
import { site } from "@/content/site";
import { cloudflareEnv, getStorage, sha256Hex, type Application, type ResumeSubmission } from "@/lib/storage";
import { readPhotoLink } from "@/lib/linkedin";
import { syncLead } from "@/lib/leads";
import { waitUntil } from "@/lib/env";
import { extractContact } from "@/lib/extract";
import { checkResumeFile } from "@/lib/validation";

const { errors, maxBytes } = site.upload;

/** Multipart overhead allowance on top of the file itself. */
const MAX_REQUEST_BYTES = maxBytes + 256 * 1024;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function fail(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}

// Work authorization (v3) and the pitch (v4) are no longer collected. Old clients may still send `workAuth`,
// `pitch` or `pitchSource`; they are ignored.

/** Plain English until copy keys exist in content/site.ts. */
const NO_RESUME = {
  details: "We lost your name and company. Go back a step and try again.",
  email: "Add an email so we can reach you, or upload your resume.",
};

const EMAIL_RE = /^[^\s@<>(),;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/i;
const validEmail = (v: string) => v.length <= 254 && EMAIL_RE.test(v);

/** Collapse control characters and runs of spaces. */
const tidy = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/** The Tal application details sent with the resume. Everything is trimmed; nothing here is trusted for logic. */
function readApplication(raw: unknown): Application | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (k: string, n = 120) => (typeof r[k] === "string" ? tidy(r[k] as string).slice(0, n) : "");
  const name = str("name"), company = str("company"), designation = str("designation");
  if (!name || !company) return null;
  const status = str("linkedinStatus");
  const url = str("linkedinUrl", 300);
  return {
    // "/pune" sends "tal-india"; anything else is the US site. The leads desk splits on this.
    program: r.program === "tal-india" ? "tal-india" : "tal-select-us",
    name,
    company,
    designation,
    linkedinUrl: /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\//i.test(url) ? url : null,
    linkedinStatus: status === "confirmed" || status === "typed" ? status : "skipped",
    // Keep the confirmed card only if it's a sane size; never drop the application over it.
    // The signed proxy link is dropped from the JSON; the LinkedIn photo URL behind it goes to applications.linkedin_photo
    // (for the leads desk), set in POST below.
    linkedinProfile:
      r.linkedinProfile && typeof r.linkedinProfile === "object" && JSON.stringify(r.linkedinProfile).length < 20_000
        ? { ...(r.linkedinProfile as Record<string, unknown>), photo: undefined }
        : null,
    workAuth: null,
    email: validEmail(str("email", 254).toLowerCase()) ? str("email", 254).toLowerCase() : null,
  };
}

/** The media.licdn.com URL behind a photo link minted by /api/linkedin/poll, or null (unsigned, foreign or missing). */
async function photoFromLink(secret: string, link: unknown): Promise<string | null> {
  if (typeof link !== "string" || !link || link.length > 4000) return null;
  try {
    const q = new URL(link, "https://local.invalid").searchParams;
    return await readPhotoLink(secret, q.get("u"), q.get("s"));
  } catch {
    return null;
  }
}

function parseJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Check the first bytes so a renamed .png can't pass as a resume. PDF = "%PDF", DOCX = zip "PK\x03\x04". */
function hasResumeSignature(bytes: Uint8Array, ext: string): boolean {
  const ascii = (n: number) => String.fromCharCode(...bytes.subarray(0, n));
  if (ext === ".pdf") return ascii(1024).includes("%PDF");
  if (ext === ".docx") return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return false;
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) return fail(413, errors.tooBigForServer);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, errors.server);
  }

  // Honeypot: real people never see this field. Pretend it worked.
  if (form.get("company_website")) return Response.json({ ok: true, id: "ok", email: null });

  const rawApplication = parseJson(form.get("application"));
  let application: Application | null = null;
  try {
    application = readApplication(rawApplication);
  } catch {
    application = null;
  }
  // The card's photo is our signed proxy link (/api/linkedin/photo?u=&s=); keep the LinkedIn URL behind it for /leads.
  const photo = (rawApplication as { linkedinProfile?: { photo?: unknown } } | null)?.linkedinProfile?.photo;

  // The resume is optional. An empty file input (no name, no bytes) counts as no resume.
  const picked = form.get("resume");
  const file = picked instanceof File && (picked.size > 0 || picked.name) ? picked : null;
  if (picked !== null && !(picked instanceof File) && picked !== "") return fail(400, errors.wrongType(""));

  let bytes: Uint8Array | null = null;
  let fileInfo: ResumeSubmission["file"] = null;
  let contact = { email: null as string | null, linkedin: null as string | null };
  if (file) {
    const check = checkResumeFile(file);
    if (!check.ok) return fail(check.reason === "size" ? 413 : 400, check.message);
    bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasResumeSignature(bytes, check.ext)) return fail(400, errors.corrupt);
    // Read the email and LinkedIn off the resume itself.
    contact = await extractContact(bytes, check.ext);
    fileInfo = { name: file.name.slice(0, 200), type: file.type, size: file.size, ext: check.ext, sha256: await sha256Hex(bytes) };
  } else {
    if (!application) return fail(400, NO_RESUME.details);
    if (!application.email) return fail(400, NO_RESUME.email);
  }

  const utmRaw = parseJson(form.get("utm"));
  const utm: Record<string, string> = {};
  if (utmRaw && typeof utmRaw === "object") {
    for (const key of UTM_KEYS) {
      const value = (utmRaw as Record<string, unknown>)[key];
      if (typeof value === "string" && value) utm[key] = value.slice(0, 200);
    }
  }

  const submission: ResumeSubmission = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    // The resume's email wins; a typed one fills in when the resume has none (or there's no resume).
    email: contact.email ?? application?.email ?? "",
    linkedin: contact.linkedin ?? application?.linkedinUrl ?? null,
    file: fileInfo,
    meta: {
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
      utm,
    },
    consent: { privacy: site.legal.privacyUrl, terms: site.legal.termsUrl },
  };

  const env = await cloudflareEnv();
  if (application && env?.LINK_SECRET) application.linkedinPhoto = await photoFromLink(env.LINK_SECRET, photo);

  // A resume that comes back with the typed email (the no-email path) completes its email-less row: same id.
  let id = submission.id;
  try {
    ({ id } = await (await getStorage()).save(submission, bytes, application));
  } catch (error) {
    console.error("[upload] storage failed", error instanceof Error ? error.message : "unknown");
    return fail(500, errors.server);
  }

  // Into the team's Google Sheet, after the reply, but only a complete lead. With no email the reply below makes the
  // flow ask for one, and the resume comes back with it; that upload pushes the row (the sheet upserts by id).
  // If the push fails the row stays pending for /api/leads/resync.
  // India leads (/pune) stay off the US sheet: they live on /leads/pune and its CSV.
  if (env && submission.email && application?.program !== "tal-india") await waitUntil(syncLead(env, new URL(request.url).origin, id));

  return Response.json({ ok: true, id, email: submission.email || null });
}
