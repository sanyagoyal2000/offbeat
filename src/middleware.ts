import { NextResponse, type NextRequest } from "next/server";

/** Anonymous, cookie-based identity for the demo (no accounts). */
export const UID_COOKIE = "ob_uid";

export function middleware(req: NextRequest) {
  if (req.cookies.get(UID_COOKIE)) return NextResponse.next();
  const uid = `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  // Make the id visible to this same request's server components and route handlers.
  const headers = new Headers(req.headers);
  headers.set("cookie", `${req.headers.get("cookie") ? `${req.headers.get("cookie")}; ` : ""}${UID_COOKIE}=${uid}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(UID_COOKIE, uid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export const config = { matcher: ["/((?!_next/|images/|favicon.ico).*)"] };
