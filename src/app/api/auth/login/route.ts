import { NextResponse } from "next/server";
import { UserAuthError, UserLoginSchema, logIn } from "@/lib/server/userAuth";
import { setUserSessionCookie } from "@/lib/server/userSessionCookie";

export async function POST(req: Request) {
  const parsed = UserLoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  try {
    const { account, session } = await logIn(parsed.data.username, parsed.data.password);
    const res = NextResponse.json({ account: { username: account.username, displayName: account.displayName } });
    setUserSessionCookie(res, session);
    return res;
  } catch (e) {
    if (e instanceof UserAuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
}
