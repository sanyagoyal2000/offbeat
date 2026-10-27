import "server-only";
import { track } from "./analytics";
import * as social from "./db/social";

export const savedIds = (uid: string) => social.savedEventIds(uid);

export async function setSaved(uid: string, eventId: string, saved: boolean) {
  if (await social.setSaved(uid, eventId, saved)) await track({ kind: "save", eventId, uid, source: "real" });
}
