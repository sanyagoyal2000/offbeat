import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./db/client";
import { userIdFor } from "./db/users";
import { userSessions, users } from "./db/schema";
import { savedIds, setSaved } from "./saved";
import { getTaste, saveTaste } from "./taste";
import { UserAuthError, accountForSession, logIn, logOut, signUp } from "./userAuth";

const PW = "long enough password";

describe("attendee accounts", () => {
  it("signing up keeps the guest's data and retires the guest cookie", async () => {
    const guest = "u_aaaaaaaaaaaaaaaa";
    await setSaved(guest, "jazz-at-the-attic", true);
    await saveTaste(guest, { interests: [{ id: "871AE4FF-0D03-45CE-A6E1-B255607FA3DD", name: "Prateek Kuhad", type: "artist" }], notes: [] });
    const guestRow = await userIdFor(guest);

    const { account } = await signUp(guest, { username: "Asha.K", password: PW });
    expect(account.username).toBe("asha.k");
    expect(account.userId).toBe(guestRow); // same row: data comes along
    expect([...(await savedIds(account.key))]).toEqual(["jazz-at-the-attic"]);
    expect((await getTaste(account.key)).interests.map((i) => i.name)).toEqual(["Prateek Kuhad"]);
    expect(account.key.startsWith("acct:")).toBe(true);
    // The old guest cookie no longer reaches the account.
    expect(await userIdFor(guest)).not.toBe(guestRow);
    expect(await savedIds(guest)).toEqual(new Set());
  });

  it("stores only a salted hash and rejects taken usernames (case-insensitive)", async () => {
    const [row] = await db().select().from(users).where(eq(users.username, "asha.k"));
    expect(JSON.stringify(row)).not.toContain(PW);
    expect(row.passwordHash).toHaveLength(128);
    await expect(signUp("u_bbbbbbbbbbbbbbbb", { username: "ASHA.K", password: PW })).rejects.toBeInstanceOf(UserAuthError);
  });

  it("logs in, resolves the session, and logs out", async () => {
    await expect(logIn("asha.k", "wrong password")).rejects.toThrow(/incorrect/);
    const { session, account } = await logIn("Asha.K", PW);
    expect((await accountForSession(session.token))?.userId).toBe(account.userId);
    expect(JSON.stringify(await db().select().from(userSessions))).not.toContain(session.token);
    expect(await accountForSession("forged-token")).toBeNull();
    await logOut(session.token);
    expect(await accountForSession(session.token)).toBeNull();
  });

  it("throttles repeated failures", async () => {
    await signUp("u_cccccccccccccccc", { username: "ravi", password: PW });
    for (let i = 0; i < 5; i++) await logIn("ravi", "nope").catch(() => {});
    await expect(logIn("ravi", PW)).rejects.toThrow(/Too many attempts/);
  });
});
