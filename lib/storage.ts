/**
 * Where resumes go. The API route only talks to `getStorage()`.
 *
 * - On Cloudflare (and `next dev`, via OpenNext's local bindings): file in KV (`RESUMES`, key
 *   "resume:<id>"), one row per submission in D1 (`DB`, table `submissions`).
 * - Railway (plain `next start` with DATA_DIR): the same code path over SQLite + files (lib/node-bindings.ts):
 *   rows in ${DATA_DIR}/talboss.sqlite, resumes in ${DATA_DIR}/resumes/. See docs/team/RAILWAY.md.
 * - Anywhere else (bare `next start`, no DATA_DIR, no Cloudflare): ./.uploads/<id>/, gitignored because it's personal data.
 *
 * One lead per person (migration 0005): the no-email path sends the same resume twice, first without an email (the
 * reply has `email: null`, so the flow asks for one), then again with the typed address. On D1, an upload whose resume
 * bytes (SHA-256), name, company and designation match an email-less submission from the last 30 minutes UPDATES
 * that row instead of inserting a second one: same id, same KV resume. See `findEmailless` below.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nodeEnv, useNodeBindings } from "./node-bindings";

export type ResumeSubmission = {
  id: string;
  createdAt: string;
  /** Read off the resume; "" when none was found. */
  email: string;
  linkedin: string | null;
  /** null when they applied without a resume (then the email comes from the application). */
  file: { name: string; type: string; size: number; ext: string; /** hex SHA-256 of the bytes */ sha256: string } | null;
  meta: { userAgent: string | null; referrer: string | null; utm: Record<string, string> };
  /** Policies the person agreed to by uploading (shown under the upload box). */
  consent: { privacy: string; terms: string };
};

/** Tal application details collected before the resume (name, LinkedIn, email, the intro they saw). */
export type Application = {
  program: string;
  name: string;
  company: string;
  designation: string;
  linkedinUrl: string | null;
  linkedinStatus: "confirmed" | "typed" | "skipped";
  linkedinProfile: unknown;
  /** media.licdn.com URL of the confirmed card's photo (shown on /leads through the signed proxy), or null. */
  linkedinPhoto?: string | null;
  /** Deprecated (v3): no longer collected. New rows store null; old rows keep their value in `work_auth`. */
  workAuth?: string | null;
  /** Typed by the person; required when there's no resume. */
  email: string | null;
};

/** `id` is the row the lead lives in: the new one, or the email-less row it was merged into (`merged: true`). */
export type SaveResult = { id: string; merged: boolean };

export interface ResumeStorage {
  save(submission: ResumeSubmission, file: Uint8Array | null, application?: Application | null): Promise<SaveResult>;
}

/** How far back an email-less upload can be completed by the same resume coming back with an email. */
export const MERGE_WINDOW_MS = 30 * 60_000;

/** Case, width and spacing don't make a different person: "Ana  Ruiz" = "ana ruiz". */
export const normalised = (v: string | null | undefined) => (v ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** Hex SHA-256 of the resume bytes. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>); // never a SharedArrayBuffer here
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

type MergeCandidate = { id: string; meta: string; app_meta: string; name: string; company: string; designation: string };

/**
 * The email-less submission this upload completes, or null. All of: same resume bytes (SHA-256), created in the last
 * 30 minutes, no email on the submission or its application, and the same name, company and designation (normalised).
 */
async function findEmailless(env: CloudflareEnv, s: ResumeSubmission, a: Application | null | undefined): Promise<MergeCandidate | null> {
  if (!s.file?.sha256 || !a) return null;
  const since = new Date(Date.parse(s.createdAt) - MERGE_WINDOW_MS).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.meta, a.meta AS app_meta, a.name, a.company, a.designation
     FROM submissions s JOIN applications a ON a.submission_id = s.id
     WHERE s.resume_sha256 = ? AND s.created_at >= ? AND s.email = '' AND COALESCE(a.email, '') = ''
     ORDER BY s.created_at DESC LIMIT 20`,
  )
    .bind(s.file.sha256, since)
    .all<MergeCandidate>();
  const same = (x: string, y: string) => normalised(x) === normalised(y);
  return results.find((r) => same(r.name, a.name) && same(r.company, a.company) && same(r.designation, a.designation)) ?? null;
}

/** The old meta JSON with the new one on top; UTM tags from either visit are kept, and `mergedAt` says when. */
function mergeMeta(old: string, next: Record<string, unknown>, at: string): string {
  let prev: Record<string, unknown> = {};
  try {
    prev = JSON.parse(old) as Record<string, unknown>;
  } catch {}
  const utm = { ...((prev.utm as object | undefined) ?? {}), ...((next.utm as object | undefined) ?? {}) };
  return JSON.stringify({ ...prev, ...next, utm, mergedAt: at });
}

/**
 * The Worker's bindings, or null when not running on Cloudflare. On a Node server with DATA_DIR set (Railway) it's the
 * same shape over SQLite + files (lib/node-bindings.ts), so everything below (merging, leads, resync, sheet) is shared.
 */
export async function cloudflareEnv(): Promise<CloudflareEnv | null> {
  if (useNodeBindings()) return nodeEnv();
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env.DB && env.RESUMES ? env : null;
  } catch {
    return null;
  }
}

export const resumeKey = (id: string) => `resume:${id}`;

function cloudflare(env: CloudflareEnv): ResumeStorage {
  return {
    async save(s, file, a) {
      // Only complete leads (with an email) wait for the Google Sheet; an email-less one never goes there.
      // India leads (/pune) never go to the US sheet either: they have their own desk, /leads/pune.
      const pending = s.email && a?.program !== "tal-india" ? 1 : 0;
      const prev = await findEmailless(env, s, a);
      if (prev && a) {
        // The same resume is already in KV under resume:<prev.id>; keep it and the row's id and created_at.
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE submissions SET email = ?, linkedin = COALESCE(?, linkedin), meta = ?, sheet_pending = ? WHERE id = ?`,
          ).bind(s.email, s.linkedin, mergeMeta(prev.meta, s.meta, s.createdAt), pending, prev.id),
          env.DB.prepare(
            `UPDATE applications SET email = ?, linkedin_url = ?, linkedin_status = ?, linkedin_profile = ?,
               linkedin_photo = COALESCE(?, linkedin_photo), meta = ? WHERE submission_id = ?`,
          ).bind(
            a.email, a.linkedinUrl, a.linkedinStatus, a.linkedinProfile ? JSON.stringify(a.linkedinProfile) : null,
            a.linkedinPhoto ?? null, mergeMeta(prev.app_meta, { utm: s.meta.utm, referrer: s.meta.referrer }, s.createdAt), prev.id,
          ),
        ]);
        return { id: prev.id, merged: true };
      }
      if (file && s.file) await env.RESUMES.put(resumeKey(s.id), file, { metadata: { name: s.file.name, type: s.file.type } });
      await env.DB.prepare(
        `INSERT INTO submissions (id, created_at, email, linkedin, interests, file_name, file_type, file_size, file_ext, meta, consent, has_resume, resume_sha256, sheet_pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          s.id,
          s.createdAt,
          s.email,
          s.linkedin,
          "[]", // interests: the form that collected them is gone
          s.file?.name ?? "",
          s.file?.type ?? "",
          s.file?.size ?? 0,
          s.file?.ext ?? "",
          JSON.stringify(s.meta),
          JSON.stringify(s.consent),
          s.file ? 1 : 0,
          s.file?.sha256 ?? null,
          pending,
        )
        .run();
      if (a) {
        await env.DB.prepare(
          `INSERT INTO applications (id, created_at, submission_id, program, name, company, designation, linkedin_url, linkedin_status, linkedin_profile, work_auth, meta, email, pitch, pitch_source, linkedin_photo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            crypto.randomUUID(), s.createdAt, s.id, a.program, a.name, a.company, a.designation, a.linkedinUrl, a.linkedinStatus,
            a.linkedinProfile ? JSON.stringify(a.linkedinProfile) : null, null, JSON.stringify({ utm: s.meta.utm, referrer: s.meta.referrer }),
            a.email, null, null, // pitch, pitch_source: the pitch was removed in v4; columns kept for old rows
            a.linkedinPhoto ?? null,
          )
          .run();
      }
      return { id: s.id, merged: false };
    },
  };
}

const localDisk: ResumeStorage = {
  async save(submission, file, application) {
    const root = process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), ".uploads");
    const dir = path.join(/*turbopackIgnore: true*/ root, submission.id);
    await mkdir(dir, { recursive: true });
    if (file && submission.file) await writeFile(path.join(dir, `resume${submission.file.ext}`), file);
    await writeFile(path.join(dir, "submission.json"), JSON.stringify({ ...submission, application: application ?? null }, null, 2));
    console.info(`[storage] saved ${submission.id} (${submission.email}) -> ${dir}`);
    return { id: submission.id, merged: false }; // no merging on local disk: D1 / DATA_DIR only
  },
};

export async function getStorage(): Promise<ResumeStorage> {
  const env = await cloudflareEnv();
  return env ? cloudflare(env) : localDisk;
}

// Reading rows back (the leads desk, /sheet.csv, the sheet push) lives in lib/leads.ts.
