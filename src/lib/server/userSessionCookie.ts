import "server-only";
import type { NextResponse } from "next/server";
import { USER_SESSION_COOKIE } from "./userAuth";

const base = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export function setUserSessionCookie(res: NextResponse, session: { token: string; expiresAt: Date }) {
  res.cookies.set(USER_SESSION_COOKIE, session.token, { ...base, expires: session.expiresAt });
}
export function clearUserSessionCookie(res: NextResponse) {
  res.cookies.set(USER_SESSION_COOKIE, "", { ...base, maxAge: 0 });
}
