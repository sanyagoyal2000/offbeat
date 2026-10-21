import { NextResponse } from "next/server";
import { AuthError, LoginSchema, createSession, verifyLogin } from "@/lib/server/auth";
import { setSessionCookie } from "@/lib/server/sessionCookie";

export async function POST(req: Request) {
  const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  try {
    const account = await verifyLogin(parsed.data.email, parsed.data.password);
    const session = await createSession(account.id);
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, session.token);
    return res;
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
}
