/** Password hashing shared by organizer and attendee accounts: scrypt with a random 16-byte salt. */
import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string, salt = randomBytes(16)) {
  return { salt: salt.toString("hex"), hash: (await scrypt(password, salt, 64)).toString("hex") };
}

/** Constant-time comparison against a stored salt + hash. */
export async function passwordMatches(stored: { salt: string; hash: string }, password: string) {
  const { hash } = await hashPassword(password, Buffer.from(stored.salt, "hex"));
  const x = Buffer.from(hash, "hex");
  const y = Buffer.from(stored.hash, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export const newSessionToken = () => randomBytes(32).toString("base64url");
