/**
 * Leads: every submission (application + resume) as one record, for the leads desk (/leads), the CSV
 * (/sheet.csv) and the push into the team's Google Sheet (an Apps Script web app, scripts/leads-sheet.gs).
 *
 * Sheet sync: only complete leads (with an email) go to the sheet. Such a row is written with sheet_pending = 1, and
 * /api/upload pushes it right after the save (ctx.waitUntil, one retry); on success sheet_pending = 0. An email-less
 * row is written with sheet_pending = 0 and never pushed; when the same resume comes back with the typed email
 * (lib/storage.ts, findEmailless) that row is updated, set pending and pushed under its own id. Anything still
 * pending (webhook down, not configured yet, or rows from before migration 0004) is pushed by /api/leads/resync.
 * The Apps Script upserts by id, so pushing twice is harmless.
 */
import { signResumeId, sameKey } from "@/lib/signing";
import { photoLink } from "@/lib/linkedin";

export type LeadRow = {
  id: string;
  created_at: string;
  email: string;
  linkedin: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  has_resume: number;
  meta: string;
  notes: string | null;
  sheet_pending: number;
  sheet_synced_at: string | null;
  name: string | null;
  company: string | null;
  designation: string | null;
  app_linkedin: string | null;
  linkedin_status: string | null;
  linkedin_profile: string | null;
  linkedin_photo: string | null;
  program: string | null;
  app_email: string | null;
};

const SELECT = `SELECT s.id, s.created_at, s.email, s.linkedin, s.file_name, s.file_type, s.file_size, s.has_resume, s.meta,
       s.notes, s.sheet_pending, s.sheet_synced_at,
       a.name, a.company, a.designation, a.linkedin_url AS app_linkedin, a.linkedin_status, a.linkedin_profile,
       a.linkedin_photo, a.program, a.email AS app_email
FROM submissions s LEFT JOIN applications a ON a.submission_id = s.id`;

/* ------------------------------------------------------------------ reads */

/** Which desk: "us" = /leads (everything that isn't India, so old rows stay here), "india" = /leads/pune. */
export type LeadMarket = "us" | "india";
const INDIA = "tal-india";
const MARKET = (m: LeadMarket) => (m === "india" ? `a.program = '${INDIA}'` : `COALESCE(a.program, '') <> '${INDIA}'`);

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const SEARCH = `(a.name LIKE ?1 ESCAPE '\\' OR a.company LIKE ?1 ESCAPE '\\' OR s.email LIKE ?1 ESCAPE '\\' OR a.email LIKE ?1 ESCAPE '\\')`;

/** One page of leads, newest first. `q` matches name, company or email (case-insensitive). */
export async function listLeads(
  env: CloudflareEnv,
  { q = "", page = 1, perPage = 50, market = "us" as LeadMarket } = {},
): Promise<{ rows: LeadRow[]; total: number }> {
  const term = q.trim().slice(0, 100);
  const where = ` WHERE ${MARKET(market)}${term ? ` AND ${SEARCH}` : ""}`;
  const offset = (Math.max(1, page) - 1) * perPage;
  const bind = term ? [like(term)] : [];
  const [list, count] = await env.DB.batch([
    env.DB.prepare(`${SELECT}${where} ORDER BY s.created_at DESC LIMIT ${perPage} OFFSET ${offset}`).bind(...bind),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM submissions s LEFT JOIN applications a ON a.submission_id = s.id${where}`).bind(...bind),
  ]);
  return { rows: list.results as LeadRow[], total: Number((count.results[0] as { n: number } | undefined)?.n ?? 0) };
}

/** Every lead, oldest first (the CSV). */
export async function allLeads(env: CloudflareEnv, limit = 5000, market: LeadMarket = "us"): Promise<LeadRow[]> {
  const { results } = await env.DB.prepare(`${SELECT} WHERE ${MARKET(market)} ORDER BY s.created_at ASC LIMIT ?`).bind(limit).all<LeadRow>();
  return results;
}

export async function getLead(env: CloudflareEnv, id: string): Promise<LeadRow | null> {
  return env.DB.prepare(`${SELECT} WHERE s.id = ?`).bind(id).first<LeadRow>();
}

export async function pendingCount(env: CloudflareEnv): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM submissions s LEFT JOIN applications a ON a.submission_id = s.id WHERE s.sheet_pending = 1 AND ${MARKET("us")}`,
  ).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

export async function setNotes(env: CloudflareEnv, id: string, notes: string): Promise<boolean> {
  const r = await env.DB.prepare(`UPDATE submissions SET notes = ? WHERE id = ?`).bind(notes || null, id).run();
  return (r.meta.changes ?? 0) > 0;
}

/* ------------------------------------------------------------------ shaping */

export type LeadProfile = {
  headline: string;
  location: string;
  experience: { title: string; company: string; duration: string; current: boolean }[];
};

/** Headline, location and the top 3 roles from the stored LinkedIn card. Never throws. */
export function leadProfile(json: string | null): LeadProfile {
  const empty: LeadProfile = { headline: "", location: "", experience: [] };
  if (!json) return empty;
  try {
    const p = JSON.parse(json) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    const exp = Array.isArray(p.experience) ? (p.experience as Record<string, unknown>[]) : [];
    return {
      headline: s(p.headline),
      location: s(p.location),
      experience: exp.slice(0, 3).map((e) => ({ title: s(e?.title), company: s(e?.company), duration: s(e?.duration), current: e?.current === true })),
    };
  } catch {
    return empty;
  }
}

export function leadUtm(meta: string): Record<string, string> {
  try {
    return (JSON.parse(meta) as { utm?: Record<string, string> }).utm ?? {};
  } catch {
    return {};
  }
}

/** "linkedin / paid / sf-launch" from the UTM tags, or "direct". (The stored referrer is our own page, so it says nothing.) */
export function leadSource(meta: string): string {
  const utm = leadUtm(meta);
  const parts = [utm.utm_source, utm.utm_medium, utm.utm_campaign].filter(Boolean);
  return parts.length ? parts.join(" / ") : "direct";
}

export const leadEmail = (r: LeadRow) => r.email || r.app_email || "";
export const leadLinkedin = (r: LeadRow) => r.app_linkedin || r.linkedin || "";

/** The signed, never-expiring link to one resume (the signature is per id, not time-bound). "" when there's no resume. */
export async function resumeUrl(origin: string, secret: string, r: Pick<LeadRow, "id" | "has_resume">): Promise<string> {
  return r.has_resume === 0 ? "" : `${origin}/r/${r.id}/${await signResumeId(secret, r.id)}`;
}

/** The person's LinkedIn photo through the signed same-origin proxy, or "". */
export const leadPhoto = (secret: string, r: LeadRow) => photoLink(secret, r.linkedin_photo ?? "");

function zoned(iso: string, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
}

/** "2026-11-03 18:55": unambiguous, and Sheets reads it as a date-time in any locale. */
export function istStamp(iso: string) {
  const p = zoned(iso, "Asia/Kolkata");
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** "4 Nov, 18:55 IST" / "4 Nov, 5:25 AM PT" for the desk. */
export function humanTime(iso: string, zone: "IST" | "PT") {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone === "IST" ? "Asia/Kolkata" : "America/Los_Angeles",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: zone === "PT",
    }).format(new Date(iso)) + ` ${zone}`
  );
}

/* ------------------------------------------------------------------ sheet push */

/** One row for the Apps Script. Keys are the contract with scripts/leads-sheet.gs. */
export type SheetLead = {
  id: string;
  submittedIst: string;
  name: string;
  company: string;
  title: string;
  email: string;
  linkedinUrl: string;
  linkedinStatus: string;
  headline: string;
  resumeUrl: string;
  resumeName: string;
  source: string;
};

export async function sheetLead(origin: string, secret: string, r: LeadRow): Promise<SheetLead> {
  return {
    id: r.id,
    submittedIst: istStamp(r.created_at),
    name: r.name ?? "",
    company: r.company ?? "",
    title: r.designation ?? "",
    email: leadEmail(r),
    linkedinUrl: leadLinkedin(r),
    linkedinStatus: r.linkedin_status ?? "",
    headline: leadProfile(r.linkedin_profile).headline,
    resumeUrl: await resumeUrl(origin, secret, r),
    resumeName: r.has_resume === 0 ? "" : r.file_name,
    source: leadSource(r.meta),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST rows to the Apps Script; true only when it answers {ok:true}. One retry. Never throws, never logs the secret. */
export async function pushToSheet(env: CloudflareEnv, rows: SheetLead[]): Promise<boolean> {
  if (!env.LEADS_WEBHOOK_URL || !env.LEADS_WEBHOOK_SECRET || !rows.length) return false;
  const body = JSON.stringify({ secret: env.LEADS_WEBHOOK_SECRET, rows });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(1500);
    try {
      // Apps Script answers a POST with a 302 to googleusercontent.com; fetch follows it (as a GET) to the JSON reply.
      const res = await fetch(env.LEADS_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      if (res.ok && (JSON.parse(text) as { ok?: boolean }).ok === true) return true;
      console.error("[leads] sheet push refused", res.status);
    } catch (error) {
      console.error("[leads] sheet push failed", error instanceof Error ? error.name : "unknown");
    }
  }
  return false;
}

async function markSynced(env: CloudflareEnv, ids: string[]) {
  const now = new Date().toISOString();
  await env.DB.batch(ids.map((id) => env.DB.prepare(`UPDATE submissions SET sheet_pending = 0, sheet_synced_at = ? WHERE id = ?`).bind(now, id)));
}

/** Push one new lead (called from /api/upload inside ctx.waitUntil). On failure the row just stays pending. */
export async function syncLead(env: CloudflareEnv, origin: string, id: string): Promise<boolean> {
  if (!env.LEADS_WEBHOOK_URL || !env.LEADS_WEBHOOK_SECRET || !env.LINK_SECRET) return false;
  try {
    const row = await getLead(env, id);
    if (!row) return false;
    const ok = await pushToSheet(env, [await sheetLead(origin, env.LINK_SECRET, row)]);
    if (ok) await markSynced(env, [id]);
    else await env.DB.prepare(`UPDATE submissions SET sheet_pending = 1 WHERE id = ?`).bind(id).run();
    return ok;
  } catch (error) {
    console.error("[leads] sync failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

/** Push every pending row, oldest first, in batches of 50 (at most `max` per call). Stops at the first failed batch. */
export async function resyncPending(env: CloudflareEnv, origin: string, max = 500): Promise<{ pushed: number; pending: number; ok: boolean }> {
  let pushed = 0;
  let ok = true;
  while (pushed < max) {
    const { results } = await env.DB.prepare(`${SELECT} WHERE s.sheet_pending = 1 AND ${MARKET("us")} ORDER BY s.created_at ASC LIMIT 50`).all<LeadRow>();
    if (!results.length) break;
    const rows = await Promise.all(results.map((r) => sheetLead(origin, env.LINK_SECRET, r)));
    if (!(await pushToSheet(env, rows))) {
      ok = false;
      break;
    }
    await markSynced(env, results.map((r) => r.id));
    pushed += results.length;
  }
  return { pushed, pending: await pendingCount(env), ok };
}

/* ------------------------------------------------------------------ access */

export const LEADS_COOKIE = "tal_leads";

/** The cookie holds a hash of LEADS_KEY, never the key itself. Rotating the key signs everyone out. */
export async function leadsSession(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tal-leads-session:${key}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True for ?key=<LEADS_KEY> or a valid leads cookie. False (so the caller 404s) when LEADS_KEY isn't set. */
export async function leadsAllowed(env: CloudflareEnv | null, { key, cookie }: { key?: string | null; cookie?: string | null }): Promise<boolean> {
  if (!env?.LEADS_KEY) return false;
  if (key && sameKey(key, env.LEADS_KEY)) return true;
  return !!cookie && sameKey(cookie, await leadsSession(env.LEADS_KEY));
}

/** The leads cookie from a raw Cookie header (route handlers that only have the Request). */
export function cookieFrom(request: Request, name = LEADS_COOKIE): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
