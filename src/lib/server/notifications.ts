/**
 * In-app notifications and notification preferences. Nothing is sent outside the app:
 * no email, SMS or push. Preferences are stored for when a real channel is connected.
 */
import "server-only";
import { z } from "zod";
import { CATEGORIES } from "@/lib/categories";
import * as social from "./db/social";
import * as users from "./db/users";

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
  const raw = await users.getPrefsJson(uid);
  if (!raw) return DEFAULT_PREFS;
  const parsed = PrefsSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : DEFAULT_PREFS;
}
export async function savePrefs(uid: string, p: Prefs) {
  await users.savePrefsJson(uid, JSON.stringify(p), p.audienceOptIn);
}

export type Notification = social.Notification;
export const addNotification = social.addNotification;
export const inbox = (uid: string) => social.listNotifications(uid);
export const markAllRead = social.markAllRead;
