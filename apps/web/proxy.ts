import { NextResponse, type NextRequest } from "next/server";

/**
 * Host routing:
 *  - admin.<domain>/*  → app/admin/*  (admin panel; admin-only cookies)
 *  - <domain>/admin/*  → 404 (admin is never served on the public host)
 * Plus cheap auth gating based on cookie presence (real checks happen in the API).
 */
const ADMIN_HOST = (process.env.ADMIN_DOMAIN ?? "admin.localhost:3000").toLowerCase();

export function proxy(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  const { pathname, search } = req.nextUrl;
  const isAdminHost = host === ADMIN_HOST;

  // Forward the original host to the API so it can pick the user/admin scope.
  if (pathname.startsWith("/api/")) {
    const headers = new Headers(req.headers);
    headers.set("x-forwarded-host", host);
    return NextResponse.next({ request: { headers } });
  }

  if (isAdminHost) {
    const signedIn = req.cookies.has("a_at") || req.cookies.has("a_rt");
    if (pathname !== "/login" && !signedIn) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    if (pathname === "/login" && signedIn) return NextResponse.redirect(new URL("/", req.url));
    const url = req.nextUrl.clone();
    url.pathname = `/admin${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return NextResponse.rewrite(new URL("/not-found-page", req.url));
  }

  const signedIn = req.cookies.has("at") || req.cookies.has("rt");
  if (pathname.startsWith("/dashboard") && !signedIn) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/register") && signedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:png|jpg|svg|webp|avif|ico|txt|xml)$).*)"],
};
