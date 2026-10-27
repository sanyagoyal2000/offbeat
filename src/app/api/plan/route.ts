import { NextResponse } from "next/server";
import { PlanRequestSchema } from "@/lib/planSchema";
import { plan } from "@/lib/planner";
import { nowIn } from "@/lib/tz";
import { cityById } from "@/lib/locations";
import { feeRuleFor, publishedEvents, restaurantsIn, soldMaps } from "@/lib/server/catalog";
import { currentUid, exploreLocation } from "@/lib/server/identity";
import { getTaste, rankByTaste } from "@/lib/server/taste";

export async function POST(req: Request) {
  const parsed = PlanRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the request fields.", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  const r = parsed.data;
  if (r.from > r.to) return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  const loc = cityById(r.cityId) ?? (await exploreLocation());
  const events = await publishedEvents(r.cityId);
  const sold = await soldMaps(events);
  const taste = await getTaste(await currentUid());
  const ranking = taste.interests.length ? await rankByTaste(taste.interests, events) : null;
  const result = plan(r, events, sold, feeRuleFor, await restaurantsIn(r.cityId), nowIn(loc.timezone), ranking?.status === "ranked" ? ranking.rank : undefined);
  return NextResponse.json({
    ...result,
    tasteUsed: ranking?.status === "ranked",
    options: result.options.map((o) => ({ ...o, reason: ranking?.reasons.get(o.event.id)?.text ?? null, event: { id: o.event.id, title: o.event.title, category: o.event.category, image: o.event.image, venue: o.event.venue, currency: o.event.currency, summary: o.event.summary } })),
  });
}
