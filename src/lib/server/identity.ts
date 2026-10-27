import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { GUEST_ID, UID_COOKIE } from "@/lib/guestId";
import { USER_SESSION_COOKIE, accountForSession, type UserAccount } from "./userAuth";
import { EXPLORE_COOKIE, HOME_COOKIE, DEFAULT_LOCATION_ID, cityById, parseLocationCookie, type Location } from "@/lib/locations";


/**
 * Who is making this request: a signed-in account (valid session cookie) or an anonymous guest
 * (`ob_uid` cookie). `uid` is the key every repository resolves to a users row.
 */
export const currentUser = cache(async (): Promise<{ uid: string; account: UserAccount | null }> => {
  const c = await cookies();
  const account = await accountForSession(c.get(USER_SESSION_COOKIE)?.value);
  if (account) return { uid: account.key, account };
  // Only well-formed guest ids count (a forged internal "acct:" key is rejected).
  const uid = c.get(UID_COOKIE)?.value;
  if (!uid || !GUEST_ID.test(uid)) throw new Error("Missing visitor id");
  return { uid, account: null };
});

export async function currentUid(): Promise<string> {
  return (await currentUser()).uid;
}

/** The guest cookie id, ignoring any session (sign-up claims this guest's data). */
export async function guestUid(): Promise<string | null> {
  const uid = (await cookies()).get(UID_COOKIE)?.value;
  return uid && GUEST_ID.test(uid) ? uid : null;
}

/** The place being explored (may differ from home). Defaults to the first sample city. */
export async function exploreLocation(): Promise<Location> {
  const c = await cookies();
  return parseLocationCookie(c.get(EXPLORE_COOKIE)?.value) ?? cityById(DEFAULT_LOCATION_ID)!;
}

export async function homeLocation(): Promise<Location | null> {
  const c = await cookies();
  return parseLocationCookie(c.get(HOME_COOKIE)?.value);
}
