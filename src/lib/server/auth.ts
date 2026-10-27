/**
 * Organizer accounts: email + password, separate from the anonymous attendee identity.
 * Passwords are hashed with scrypt (random salt); sessions are random tokens sent as an HTTP-only
 * cookie and stored server-side only as a SHA-256 hash. Login attempts are throttled per email.
 */
import "server-only";
import { z } from "zod";
import type { Organizer } from "@/lib/events";
import * as repo from "./db/auth";
import { hashPassword, newSessionToken, passwordMatches } from "./password";


export const SESSION_COOKIE = "ob_org_session";
export const SESSION_DAYS = 14;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export type Account = repo.Account;
type Session = { token: string; accountId: string; expiresAt: number };

export const SignupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(60),
  orgName: z.string().trim().min(2, "Enter your organization's name").max(60),
  cityId: z.string().min(2),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(120),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});
export const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(1).max(200) });

export class AuthError extends Error {}

export async function signUp(input: z.infer<typeof SignupSchema>, org: (orgId: string) => Organizer): Promise<Account> {
  if (await repo.accountByEmail(input.email)) throw new AuthError("An account with this email already exists. Sign in instead.");
  const { salt, hash } = await hashPassword(input.password);
  const o = org(crypto.randomUUID());
  const account = await repo.createAccountWithOrganizer({ email: input.email, name: input.name, salt, hash }, { id: o.id, name: o.name, cityId: o.cityId, about: o.about });
  if (!account) throw new AuthError("An account with this email already exists. Sign in instead.");
  return account;
}

export async function verifyLogin(email: string, password: string): Promise<Account> {
  if ((await repo.recentAttempts(email, ATTEMPT_WINDOW_MS)) >= MAX_ATTEMPTS) throw new AuthError("Too many attempts. Wait 15 minutes and try again.");
  const account = await repo.accountByEmail(email);
  // Hash even when the account doesn't exist so response time doesn't reveal which emails are registered.
  const ok = account ? await passwordMatches(account, password) : (await hashPassword(password), false);
  if (!ok || !account) {
    await repo.recordFailedAttempt(email);
    throw new AuthError("Email or password is incorrect.");
  }
  await repo.clearAttempts(email);
  return account;
}

export async function createSession(accountId: string): Promise<Session> {
  const s: Session = { token: newSessionToken(), accountId, expiresAt: Date.now() + SESSION_DAYS * 864e5 };
  await repo.createSession(s.token, accountId, new Date(s.expiresAt));
  return s;
}

export async function accountForSession(token: string | undefined): Promise<Account | null> {
  if (!token || token.length > 100) return null;
  return repo.accountForToken(token);
}

export async function destroySession(token: string | undefined) {
  if (token) await repo.deleteSession(token);
}

/** Demo accounts for the sample organizers, created on first use. Their credentials are shown on the sign-in page. */
export const DEMO_PASSWORD = "offbeat-demo-organizer";
export const demoEmail = (orgId: string) => `${orgId.replace(/^org-/, "")}@demo.offbeat`;

export async function ensureDemoAccount(org: Organizer) {
  const email = demoEmail(org.id);
  if (await repo.accountByEmail(email)) return;
  const { salt, hash } = await hashPassword(DEMO_PASSWORD);
  // A concurrent first visit may win the race; the unique email index makes that harmless.
  await repo.createAccountWithOrganizer({ email, name: `${org.name} (demo)`, salt, hash, demo: true }, { existingId: org.id });
}
