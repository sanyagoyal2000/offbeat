import { NextResponse } from "next/server";
import { z } from "zod";
import { getEvent } from "@/lib/server/catalog";
import { currentUid } from "@/lib/server/identity";
import { savedIds, setSaved } from "@/lib/server/saved";

export async function GET() {
  return NextResponse.json({ saved: [...(await savedIds(await currentUid()))] });
}

const Body = z.object({ eventId: z.string(), saved: z.boolean() });
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!(await getEvent(parsed.data.eventId))) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  await setSaved(await currentUid(), parsed.data.eventId, parsed.data.saved);
  return NextResponse.json({ ok: true, saved: parsed.data.saved });
}
