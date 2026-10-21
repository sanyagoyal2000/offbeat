/**
 * Organizer accounts: email + password, separate from the anonymous attendee identity.
 * Passwords are hashed with scrypt (random salt); sessions are random tokens stored server-side
 * and sent as an HTTP-only cookie. Login attempts are throttled per email.
 */
import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import type { Organizer } from "@/lib/events";
import { getDoc, newId, putDoc, store } from "./store";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = "ob_org_session";
export const SESSION_DAYS = 14;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export type Account = { id: string; email: string; name: string; orgId: string; salt: string; hash: string; createdAt: string; demo?: boolean };
type Session = { token: string; accountId: string; expiresAt: number };

export const SignupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(60),
  orgName: z.string().trim().min(2, "Enter your organization's name").max(60),
  cityId: z.string().min(2),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(120),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});
export const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(1).max(200) });

const emailKey = (email: string) => `account-email:${email.toLowerCase()}`;

async function hashPassword(password: string, salt = randomBytes(16)) {
  return { salt: salt.toString("hex"), hash: (await scrypt(password, salt, 64)).toString("hex") };
}

async function passwordMatches(a: Account, password: string) {
  const { hash } = await hashPassword(password, Buffer.from(a.salt, "hex"));
  const x = Buffer.from(hash, "hex");
  const y = Buffer.from(a.hash, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export class AuthError extends Error {}

export async function signUp(input: z.infer<typeof SignupSchema>, org: (orgId: string) => Organizer): Promise<Account> {
  return store().lock(emailKey(input.email), async () => {
    if (await store().get<string>(emailKey(input.email))) throw new AuthError("An account with this email already exists. Sign in instead.");
    const orgId = newId("org");
    const { salt, hash } = await hashPassword(input.password);
    const account: Account = { id: newId("acct"), email: input.email, name: input.name, orgId, salt, hash, createdAt: new Date().toISOString() };
    await putDoc("organizers", org(orgId));
    await putDoc("accounts", account);
    await store().set(emailKey(input.email), account.id);
    return account;
  });
}

export async function verifyLogin(email: string, password: string): Promise<Account> {
  const key = `login-attempts:${email.toLowerCase()}`;
  const attempts = ((await store().get<number[]>(key)) ?? []).filter((t) => Date.now() - t < ATTEMPT_WINDOW_MS);
  if (attempts.length >= MAX_ATTEMPTS) throw new AuthError("Too many attempts. Wait 15 minutes and try again.");
  const id = await store().get<string>(emailKey(email));
  const account = id ? await getDoc<Account>("accounts", id) : null;
  // Hash even when the account doesn't exist so response time doesn't reveal which emails are registered.
  const ok = account ? await passwordMatches(account, password) : (await hashPassword(password), false);
  if (!ok || !account) {
    await store().set(key, [...attempts, Date.now()]);
    throw new AuthError("Email or password is incorrect.");
  }
  await store().del(key);
  return account;
}

export async function createSession(accountId: string): Promise<Session> {
  const s: Session = { token: randomBytes(32).toString("base64url"), accountId, expiresAt: Date.now() + SESSION_DAYS * 864e5 };
  await store().set(`org-session:${s.token}`, s);
  return s;
}

export async function accountForSession(token: string | undefined): Promise<Account | null> {
  if (!token || token.length > 100) return null;
  const s = await store().get<Session>(`org-session:${token}`);
  if (!s || s.expiresAt < Date.now()) return null;
  return getDoc<Account>("accounts", s.accountId);
}

export async function destroySession(token: string | undefined) {
  if (token) await store().del(`org-session:${token}`);
}

/** Demo accounts for the sample organizers, created on first use. Their credentials are shown on the sign-in page. */
export const DEMO_PASSWORD = "offbeat-demo-organizer";
export const demoEmail = (orgId: string) => `${orgId.replace(/^org-/, "")}@demo.offbeat`;

export async function ensureDemoAccount(org: Organizer) {
  const email = demoEmail(org.id);
  if (await store().get<string>(emailKey(email))) return;
  await store().lock(emailKey(email), async () => {
    if (await store().get<string>(emailKey(email))) return;
    const { salt, hash } = await hashPassword(DEMO_PASSWORD);
    const account: Account = { id: newId("acct"), email, name: `${org.name} (demo)`, orgId: org.id, salt, hash, createdAt: new Date().toISOString(), demo: true };
    await putDoc("accounts", account);
    await store().set(emailKey(email), account.id);
  });
}
