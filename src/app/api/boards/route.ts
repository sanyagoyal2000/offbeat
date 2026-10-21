import { NextResponse } from "next/server";
import { z } from "zod";
import { createBoard, listBoards } from "@/lib/server/boards";
import { currentUid, exploreLocation } from "@/lib/server/identity";

export async function GET() {
  return NextResponse.json({ boards: await listBoards(await currentUid()) });
}

const Body = z.object({ name: z.string().max(60), eventId: z.string().optional() });
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the board a name" }, { status: 400 });
  const loc = await exploreLocation();
  const board = await createBoard(await currentUid(), parsed.data.name, { id: loc.id, name: loc.name, currency: loc.currency }, parsed.data.eventId);
  return NextResponse.json({ board }, { status: 201 });
}
