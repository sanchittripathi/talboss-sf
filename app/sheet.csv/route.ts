import { cloudflareEnv } from "@/lib/storage";
import { sameKey } from "@/lib/signing";
import { allLeads, cookieFrom, istStamp, leadEmail, leadLinkedin, leadProfile, leadsAllowed, leadUtm, resumeUrl } from "@/lib/leads";

export const dynamic = "force-dynamic";

const HEADERS = ["Uploaded (IST)", "Name", "Company", "Designation", "Email", "LinkedIn", "LinkedIn check", "Headline", "Resume link", "Source", "Program", "File", "Notes", "ID"];

/** Quote for CSV, and never let a value start like a formula. */
function cell(value: string | null | undefined) {
  const v = String(value ?? "").replace(/^[=+\-@\t\r]+/, "");
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Every submission as CSV, oldest first. Open with ?key=SHEET_KEY (the old =IMPORTDATA sheet), or from /leads
 * ("Download CSV", the leads cookie). `?download=1` saves it as a file.
 */
export async function GET(request: Request) {
  const env = await cloudflareEnv();
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const allowed = !!env?.LINK_SECRET && ((!!env.SHEET_KEY && sameKey(key, env.SHEET_KEY)) || (await leadsAllowed(env, { cookie: cookieFrom(request) })));
  if (!env || !allowed) return new Response("Not found", { status: 404 });

  const market = url.searchParams.get("market") === "india" ? "india" : "us";
  const rows = await allLeads(env, 5000, market);
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    const link = (await resumeUrl(url.origin, env.LINK_SECRET, r)) || "no resume";
    lines.push(
      [
        istStamp(r.created_at), r.name, r.company, r.designation, leadEmail(r), leadLinkedin(r), r.linkedin_status,
        leadProfile(r.linkedin_profile).headline, link, leadUtm(r.meta).utm_source, r.program, r.file_name, r.notes, r.id,
      ]
        .map(cell)
        .join(","),
    );
  }

  const headers: Record<string, string> = { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
  if (url.searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename="tal-leads-${market === "india" ? "india-" : ""}${istStamp(new Date().toISOString()).slice(0, 10)}.csv"`;
  return new Response(lines.join("\n") + "\n", { headers });
}
