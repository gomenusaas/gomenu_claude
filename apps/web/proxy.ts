import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Hosts that serve the GoMenu app itself; any other host is a restaurant's custom domain. */
function isAppHost(host: string): boolean {
  const app = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").hostname;
  const extra = (process.env.GOMENU_APP_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return host === app || extra.includes(host) || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
}

type Resolved = { restaurant_id: string; canonical_host: string; available: boolean } | null;
const hostCache = new Map<string, { at: number; value: Resolved }>();

async function resolveHost(host: string): Promise<Resolved> {
  const hit = hostCache.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_host`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_hostname: host }),
  });
  const value = res.ok ? ((await res.json()) as Resolved) : null;
  hostCache.set(host, { at: Date.now(), value });
  return value;
}

/**
 * 1. Custom domains (spec §7): https://www.myrestaurant.com/ and /item/* are served from the
 *    restaurant's site; requests to a non-primary domain redirect to the primary one.
 * 2. Refreshes the Supabase session cookie. It makes no authorization decisions: pages ask the
 *    database (get_my_context / RLS) what the user may see.
 */
export async function proxy(request: NextRequest) {
  let rewrite: URL | null = null;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const path = request.nextUrl.pathname;
  if (host && !isAppHost(host) && (path === "/" || path.startsWith("/item/"))) {
    const site = await resolveHost(host);
    if (!site) return new NextResponse("Not found", { status: 404 });
    if (site.canonical_host && site.canonical_host !== host) {
      return NextResponse.redirect(`https://${site.canonical_host}${path}${request.nextUrl.search}`, 308);
    }
    rewrite = request.nextUrl.clone();
    rewrite.pathname = `/site/${site.restaurant_id}${path === "/" ? "" : path}`;
  }

  const next = () => (rewrite ? NextResponse.rewrite(rewrite, { request }) : NextResponse.next({ request }));
  let response = next();
  const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
