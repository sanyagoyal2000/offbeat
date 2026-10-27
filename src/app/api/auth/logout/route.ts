import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { USER_SESSION_COOKIE, logOut } from "@/lib/server/userAuth";
import { clearUserSessionCookie } from "@/lib/server/userSessionCookie";

export async function POST() {
  await logOut((await cookies()).get(USER_SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  clearUserSessionCookie(res);
  return res;
}
