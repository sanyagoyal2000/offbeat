import "server-only";
import type { OfferEvent } from "@/lib/events";
import { cityById } from "@/lib/locations";
import type { EventInput } from "./organizer";

export function emptyInput(cityId: string, preset?: Partial<EventInput>): EventInput {
  const c = cityById(cityId)!;
  const d = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  return {
    title: "",
    category: "Music",
    cityId,
    summary: "",
    description: "",
    whatYoullDo: [],
    audience: "",
    venue: { name: "", area: "", address: "", lat: c.lat, lng: c.lng },
    durationMin: 120,
    facts: {},
    image: "/images/events/folk-fables-night.jpg",
    status: "draft",
    sessions: [{ date: d, time: "19:00", tiers: [{ name: "General", price: c.currency === "INR" ? 999 : 20, capacity: 40 }] }],
    ...preset,
  };
}

export function eventToInput(e: OfferEvent): EventInput {
  return {
    title: e.title,
    category: e.category,
    cityId: e.cityId,
    summary: e.summary,
    description: e.description,
    whatYoullDo: e.whatYoullDo,
    audience: e.audience,
    venue: e.venue,
    durationMin: e.durationMin,
    facts: e.facts,
    inclusions: e.inclusions,
    exclusions: e.exclusions,
    bring: e.bring,
    restrictions: e.restrictions,
    cancellation: e.cancellation,
    movie: e.movie,
    seatLayout: e.seatLayout,
    show: e.show,
    class: e.class,
    trek: e.trek,
    image: e.image,
    status: e.status === "archived" ? "draft" : e.status,
    proposedForCluster: e.proposedForCluster,
    sessions: e.sessions.map((s) => ({ id: s.id, date: s.start.slice(0, 10), time: s.start.slice(11, 16), cancelled: s.cancelled, tiers: s.tiers.map((t) => ({ id: t.id, name: t.name, price: t.price, capacity: t.capacity })) })),
  };
}
