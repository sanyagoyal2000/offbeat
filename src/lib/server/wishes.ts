/** Wishes and organizer proposals (database-backed). Aggregates only ever use opted-in wishes. */
import "server-only";
import { eventFitsWish, type Wish, type WishInput } from "@/lib/wishes";
import type { OfferEvent } from "@/lib/events";
import * as repo from "./db/wishes";
import { addNotification } from "./notifications";

export const createWish = (uid: string, input: WishInput): Promise<Wish> => repo.createWish(uid, input);
export const updateWish = (uid: string, id: string, patch: Partial<WishInput> & { status?: "open" | "withdrawn" }) => repo.updateWish(uid, id, patch);
export const getWish = (id: string) => repo.getWish(id);
export const myWishes = (uid: string) => repo.wishesForUser(uid);

/** Opted-in wishes (real and sample) for demand aggregation. Records carry no owner id or free text. */
export const allWishes = (cityId?: string) => repo.optedInWishes(cityId);

/** When an organizer publishes an event proposed for demand, attach it to every fitting open wish. */
export async function attachProposal(event: OfferEvent, minPrice: number | null) {
  let matched = 0;
  for (const w of await repo.realOptedInWishesWithOwners(event.cityId)) {
    if (w.proposals.some((p) => p.eventId === event.id) || !eventFitsWish(w, event, minPrice)) continue;
    if (!(await repo.addProposal(w.id, event.id, event.organizerId))) continue;
    await addNotification(w.uid, { kind: "proposal", title: `An organizer proposed “${event.title}”`, body: "It matches one of your wishes. Check the details and reserve if it suits you.", href: `/events/${event.id}` });
    matched++;
  }
  // Sample wishes are counted for context only; they never receive notifications.
  const seedMatches = (await repo.optedInWishes(event.cityId)).filter((w) => w.source === "seed" && eventFitsWish(w, event, minPrice)).length;
  return { matched, seedMatches };
}
