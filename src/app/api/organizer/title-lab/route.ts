import { NextResponse } from "next/server";
import { z } from "zod";
import { getEvent } from "@/lib/server/catalog";
import { currentOrg } from "@/lib/server/organizer";
import { TitleLabError, changeTitleLab, createTitleLab, runSimulation } from "@/lib/server/titleLab";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["generate", "regenerate", "simulate"]), eventId: z.string() }),
  z.object({ action: z.enum(["approve-all", "pause", "resume"]), eventId: z.string() }),
  z.object({ action: z.enum(["approve", "remove", "restore"]), eventId: z.string(), variantId: z.string() }),
  z.object({ action: z.literal("edit"), eventId: z.string(), variantId: z.string(), title: z.string().max(200), hook: z.string().max(400) }),
  z.object({ action: z.literal("config"), eventId: z.string(), priorWeight: z.number(), exploration: z.number() }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: "Sign in as an organizer first." }, { status: 401 });
  const b = parsed.data;
  const e = await getEvent(b.eventId);
  if (!e || e.organizerId !== org.id) return NextResponse.json({ error: "You can only run a title lab on your organization's events." }, { status: 403 });
  try {
    switch (b.action) {
      case "generate":
      case "regenerate":
        if (e.status !== "published") return NextResponse.json({ error: "Publish the event first." }, { status: 409 });
        return NextResponse.json({ lab: await createTitleLab(e, org.id, { force: b.action === "regenerate" }) });
      case "simulate":
        return NextResponse.json({ lab: await runSimulation(e.id, org.id) });
    }
    return NextResponse.json({ lab: await changeTitleLab(e.id, org.id, b) });
  } catch (err) {
    if (err instanceof TitleLabError) return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
