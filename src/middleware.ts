import { NextResponse, type NextRequest } from "next/server";
import { GUEST_ID, UID_COOKIE, newGuestId } from "@/lib/guestId";

export function middleware(req: NextRequest) {
  // Only well-formed guest ids are accepted; anything else is replaced with a fresh one.
  if (GUEST_ID.test(req.cookies.get(UID_COOKIE)?.value ?? "")) return NextResponse.next();
  const uid = newGuestId();
  // Make the id visible to this same request's server components and route handlers.
  const headers = new Headers(req.headers);
  const others = (req.headers.get("cookie") ?? "").split(/;\s*/).filter((c) => c && !c.startsWith(`${UID_COOKIE}=`));
  headers.set("cookie", [...others, `${UID_COOKIE}=${uid}`].join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(UID_COOKIE, uid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export const config = { matcher: ["/((?!_next/|images/|favicon.ico).*)"] };
