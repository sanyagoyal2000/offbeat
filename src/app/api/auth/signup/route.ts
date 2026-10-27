import { NextResponse } from "next/server";
import { UID_COOKIE, newGuestId } from "@/lib/guestId";
import { currentUser, guestUid } from "@/lib/server/identity";
import { UserAuthError, UserSignupSchema, signUp } from "@/lib/server/userAuth";
import { setUserSessionCookie } from "@/lib/server/userSessionCookie";

/** Creates an account from this browser's guest (keeping their data) and signs in. */
export async function POST(req: Request) {
  const parsed = UserSignupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Check the form.", field: issue?.path[0] }, { status: 400 });
  }
  if ((await currentUser()).account) return NextResponse.json({ error: "You're already signed in. Log out first to create another account." }, { status: 409 });
  const guest = await guestUid();
  if (!guest) return NextResponse.json({ error: "Refresh the page and try again." }, { status: 400 });
  try {
    const { account, session } = await signUp(guest, parsed.data);
    const res = NextResponse.json({ account: { username: account.username, displayName: account.displayName } }, { status: 201 });
    setUserSessionCookie(res, session);
    // The old guest id now belongs to the account; give the browser a fresh one for after logout.
    res.cookies.set(UID_COOKIE, newGuestId(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (e) {
    if (e instanceof UserAuthError) return NextResponse.json({ error: e.message, field: e.field }, { status: 409 });
    throw e;
  }
}
