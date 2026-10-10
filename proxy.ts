import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, SESSION_COOKIE, verifySession } from "./lib/session";

// First gate for the dashboard: no valid session cookie, no page. The Vaani API has its own secret.
export async function proxy(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const secret = process.env.SESSION_SECRET;
  const ok = !!secret && (await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret, new Date()));
  if (ok) return NextResponse.next();
  const login = new URL("/login", req.url);
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api/vaani|login|_next/static|_next/image|favicon.ico|icon|robots.txt).*)"],
};
