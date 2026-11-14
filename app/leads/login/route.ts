import { cloudflareEnv } from "@/lib/storage";
import { LEADS_COOKIE, leadsAllowed, leadsSession } from "@/lib/leads";

export const dynamic = "force-dynamic";

/**
 * /leads?key=<LEADS_KEY> lands here: a good key sets an HttpOnly cookie (30 days, a hash of the key, never the key)
 * and redirects to /leads, so the key doesn't stay in the address bar or history. Anything else is a 404.
 * SameSite=Lax (not Strict) so the link still works when opened from Slack or email; writes need JSON, which blocks CSRF.
 */
export async function GET(request: Request) {
  const env = await cloudflareEnv();
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!env?.LEADS_KEY || !(await leadsAllowed(env, { key }))) return new Response("Not found", { status: 404 });

  const next = new URL(url.searchParams.get("to") === "pune" ? "/leads/pune" : "/leads", url.origin);
  const q = url.searchParams.get("q");
  if (q) next.searchParams.set("q", q);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      location: next.pathname + next.search,
      "set-cookie": `${LEADS_COOKIE}=${await leadsSession(env.LEADS_KEY)}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Lax${secure}`,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
