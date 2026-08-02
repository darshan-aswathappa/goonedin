import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that require an authenticated session. A request to any path that
 * starts with one of these prefixes is redirected to /login when signed out.
 */
const PROTECTED_PREFIXES = [
  "/analytics",
  "/keyword-matcher",
  "/logs",
  "/resume-optimizer",
  "/saved",
  "/settings",
];

/** Routes an authenticated user should be bounced away from (back to the app). */
const AUTH_ROUTES = ["/login"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function middleware(request: NextRequest) {
  // Keep a mutable response so Supabase can refresh the auth cookies on it.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  // IMPORTANT: getUser() refreshes the session; do not remove it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Build a redirect that carries over any auth cookies Supabase just refreshed.
  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  // Signed-in users should never see the login page.
  if (user && AUTH_ROUTES.includes(pathname)) {
    return redirectTo("/");
  }

  // Signed-out users cannot reach protected app routes.
  if (!user && isProtected(pathname)) {
    return redirectTo("/login");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all request paths except static assets and image files so the
     * session cookie stays fresh, but skip Next internals for performance.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
