import { NextResponse } from "next/server";
import { z } from "zod";
import { cityById } from "@/lib/locations";
import { getEvent } from "@/lib/server/catalog";
import { createExperiment } from "@/lib/server/experiments";
import { currentOrg } from "@/lib/server/organizer";

const Body = z.object({ eventId: z.string(), audience: z.enum(["city", "connected"]) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: "Sign in as an organizer first." }, { status: 401 });
  const e = await getEvent(parsed.data.eventId);
  if (!e || e.organizerId !== org.id) return NextResponse.json({ error: "You can only promote your organization's events." }, { status: 403 });
  if (e.status !== "published") return NextResponse.json({ error: "Publish the event before promoting it." }, { status: 409 });
  const city = cityById(e.cityId);
  const kind = parsed.data.audience;
  const x = await createExperiment(org.id, e, {
    id: `${kind}:${kind === "city" ? e.cityId : e.id}`,
    kind,
    cityId: e.cityId,
    label: kind === "city" ? `Everyone exploring ${city?.name ?? e.cityId}` : `Visitors exploring ${city?.name ?? e.cityId} whose interests Qloo connects to this event`,
  });
  return NextResponse.json({ experiment: x }, { status: 201 });
}
