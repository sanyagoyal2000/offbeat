/**
 * Attendee accounts: username + password (scrypt), sessions as random tokens in an HTTP-only cookie
 * (stored server-side only as a SHA-256 hash). Signing up keeps the guest's data: the same users row
 * becomes the account. Browsing and booking still work as a guest; group boards need an account.
 */
import "server-only";
import { z } from "zod";
import { clearAttempts, recentAttempts, recordFailedAttempt } from "./db/auth";
import * as users from "./db/users";
import { hashPassword, newSessionToken, passwordMatches } from "./password";

export const USER_SESSION_COOKIE = "ob_session";
export const USER_SESSION_DAYS = 30;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,20}$/, "3–20 characters: letters, numbers, dots or underscores");
export const UserSignupSchema = z.object({
  username: UsernameSchema,
  displayName: z.string().trim().max(40).optional(),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});
export const UserLoginSchema = z.object({ username: z.string().trim().toLowerCase().min(1).max(40), password: z.string().min(1).max(200) });

export class UserAuthError extends Error {
  constructor(
    message: string,
    public field?: "username" | "password",
  ) {
    super(message);
  }
}

export type UserAccount = users.UserAccount;
type Session = { token: string; expiresAt: Date };

async function newSession(userId: string): Promise<Session> {
  const s = { token: newSessionToken(), expiresAt: new Date(Date.now() + USER_SESSION_DAYS * 864e5) };
  await users.createUserSession(s.token, userId, s.expiresAt);
  return s;
}

/** Creates an account from the current guest (their data comes along) and signs them in. */
export async function signUp(guestUid: string, input: z.infer<typeof UserSignupSchema>): Promise<{ account: UserAccount; session: Session }> {
  if (await users.accountByUsername(input.username)) throw new UserAuthError("That username is taken. Try another.", "username");
  const { salt, hash } = await hashPassword(input.password);
  const account = await users.claimGuest(guestUid, { username: input.username, displayName: input.displayName || input.username, salt, hash });
  if (!account) throw new UserAuthError("That username is taken. Try another.", "username");
  return { account, session: await newSession(account.userId) };
}

export async function logIn(username: string, password: string): Promise<{ account: UserAccount; session: Session }> {
  const key = `user:${username.toLowerCase()}`;
  if ((await recentAttempts(key, ATTEMPT_WINDOW_MS)) >= MAX_ATTEMPTS) throw new UserAuthError("Too many attempts. Wait 15 minutes and try again.");
  const account = await users.accountByUsername(username);
  // Hash even when the account doesn't exist so timing doesn't reveal which usernames exist.
  const ok = account ? await passwordMatches(account, password) : (await hashPassword(password), false);
  if (!ok || !account) {
    await recordFailedAttempt(key);
    throw new UserAuthError("Username or password is incorrect.");
  }
  await clearAttempts(key);
  const pub: UserAccount = { userId: account.userId, key: account.key, username: account.username, displayName: account.displayName };
  return { account: pub, session: await newSession(account.userId) };
}

export async function accountForSession(token: string | undefined): Promise<UserAccount | null> {
  if (!token || token.length > 100) return null;
  return users.accountForUserToken(token);
}

export async function logOut(token: string | undefined) {
  if (token) await users.deleteUserSession(token);
}
