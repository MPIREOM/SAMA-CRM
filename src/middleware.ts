import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { routing } from "@/i18n/routing";

// ---------------------------------------------------------------------------
// One middleware, two apps:
//   • CRM / back-office (unprefixed paths listed below) → Supabase session guard
//   • Guest booking site (everything else)              → next-intl locale routing
// ---------------------------------------------------------------------------

// Staff-facing paths (no locale prefix). Anything not listed here and not an
// API route is treated as part of the public guest site.
const CRM_PREFIXES = [
  "/dashboard",
  "/bookings",
  "/reservations",
  "/calendar",
  "/rooms",
  "/rates",
  "/addons",
  "/blocks",
  "/messaging",
  "/settings",
  "/audit",
  "/inbox",
  "/contacts",
  "/automations",
  "/campaigns",
  "/templates",
  "/users",
  "/login",
  "/checkin",
  "/terms",
];

// Routes reachable without a staff session.
const PUBLIC_PATHS = [
  "/login",
  "/checkin", // guest kiosk — locked UI, no CRM data exposed
  "/terms", // marketing-consent terms linked from guest messages
  "/api/webhooks", // Meta webhook (verified by token/signature)
  "/api/checkin", // kiosk submit (service role, no session)
  "/api/kiosk", // kiosk PIN check
  "/api/cron", // scheduled-message dispatcher (bearer secret)
  "/api/bk", // public booking-site endpoints (availability, quote, .ics)
];

const intlMiddleware = createIntlMiddleware(routing);

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api");
  const isCrm = startsWithAny(pathname, CRM_PREFIXES);

  // ---- Guest site: locale routing only, no auth ---------------------------
  if (!isApi && !isCrm) {
    return intlMiddleware(request);
  }

  // ---- CRM + API: refresh the Supabase session and guard private routes ---
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the session if needed (do not remove — keeps auth alive).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = startsWithAny(pathname, PUBLIC_PATHS);

  if (!user && !isPublic) {
    if (isApi) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|images/|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|ics|woff2?)$).*)",
  ],
};
