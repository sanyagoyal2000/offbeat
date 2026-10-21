import { describe, expect, it } from "vitest";
import { AuthError, accountForSession, createSession, destroySession, signUp, verifyLogin } from "./auth";
import { getDoc } from "./store";

const org = (id: string) => ({ id, name: "Test Org", cityId: "bengaluru-in", about: "" });

describe("organizer accounts", () => {
  it("stores a salted hash, never the password", async () => {
    const a = await signUp({ name: "Asha", orgName: "Test Org", cityId: "bengaluru-in", email: "asha@example.com", password: "correct horse battery" }, org);
    const stored = JSON.stringify(await getDoc("accounts", a.id));
    expect(stored).not.toContain("correct horse battery");
    expect(a.hash).toHaveLength(128);
    await expect(signUp({ name: "B", orgName: "X", cityId: "bengaluru-in", email: "ASHA@example.com", password: "another password1" }, org)).rejects.toBeInstanceOf(AuthError);
  });

  it("verifies passwords and throttles repeated failures", async () => {
    await expect(verifyLogin("asha@example.com", "wrong password")).rejects.toThrow(/incorrect/);
    expect((await verifyLogin("asha@example.com", "correct horse battery")).email).toBe("asha@example.com");
    for (let i = 0; i < 5; i++) await verifyLogin("asha@example.com", "nope").catch(() => {});
    await expect(verifyLogin("asha@example.com", "correct horse battery")).rejects.toThrow(/Too many attempts/);
  });

  it("sessions resolve to the account until destroyed", async () => {
    const a = await signUp({ name: "Ravi", orgName: "Org", cityId: "bengaluru-in", email: "ravi@example.com", password: "long enough pw" }, org);
    const s = await createSession(a.id);
    expect((await accountForSession(s.token))?.id).toBe(a.id);
    expect(await accountForSession("forged-token")).toBeNull();
    await destroySession(s.token);
    expect(await accountForSession(s.token)).toBeNull();
  });
});
