/**
 * In-app notifications and notification preferences. Nothing is sent outside the app:
 * no email, SMS or push. Preferences are stored for when a real channel is connected.
 */
import "server-only";
import { z } from "zod";
import { CATEGORIES } from "@/lib/categories";
import { newId, store } from "./store";

export const PrefsSchema = z.object({
  optIn: z.boolean(),
  /** Allow this visitor's interests to be counted (anonymously) in organizer audience estimates. */
  audienceOptIn: z.boolean(),
  categories: z.array(z.enum(CATEGORIES)).max(10),
  frequency: z.enum(["as-it-happens", "daily", "weekly"]),
  quietHours: z.object({ from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) }).nullable(),
});
export type Prefs = z.infer<typeof PrefsSchema>;
export const DEFAULT_PREFS: Prefs = { optIn: false, audienceOptIn: false, categories: [], frequency: "weekly", quietHours: { from: "22:00", to: "08:00" } };

export async function getPrefs(uid: string): Promise<Prefs> {
  return (await store().get<Prefs>(`user:${uid}:prefs`)) ?? DEFAULT_PREFS;
}
export async function savePrefs(uid: string, p: Prefs) {
  await store().set(`user:${uid}:prefs`, p);
  if (p.audienceOptIn) await store().sadd("idx:audience-optin", uid);
  else await store().srem("idx:audience-optin", uid);
}
export const audienceOptInUids = () => store().smembers("idx:audience-optin");

export type Notification = { id: string; kind: "proposal" | "info"; title: string; body: string; href?: string; at: string; read: boolean };
const key = (uid: string) => `user:${uid}:inbox`;

export async function addNotification(uid: string, n: Omit<Notification, "id" | "at" | "read">) {
  await store().lock(key(uid), async () => {
    const list = (await store().get<Notification[]>(key(uid))) ?? [];
    list.unshift({ ...n, id: newId("ntf"), at: new Date().toISOString(), read: false });
    await store().set(key(uid), list.slice(0, 100));
  });
}
export async function inbox(uid: string) {
  return (await store().get<Notification[]>(key(uid))) ?? [];
}
export async function markAllRead(uid: string) {
  await store().lock(key(uid), async () => {
    const list = (await store().get<Notification[]>(key(uid))) ?? [];
    await store().set(key(uid), list.map((n) => ({ ...n, read: true })));
  });
}
