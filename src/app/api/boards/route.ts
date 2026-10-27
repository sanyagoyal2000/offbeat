import { NextResponse } from "next/server";
import { z } from "zod";
import { createBoard, listBoards } from "@/lib/server/boards";
import { currentUser, exploreLocation } from "@/lib/server/identity";

export async function GET() {
  const { uid, account } = await currentUser();
  return NextResponse.json({ boards: account ? await listBoards(uid) : [] });
}

const Body = z.object({ name: z.string().max(60), eventId: z.string().optional() });
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the board a name" }, { status: 400 });
  const { uid, account } = await currentUser();
  if (!account) return NextResponse.json({ error: "Log in or create an account to start a group plan.", code: "login" }, { status: 401 });
  const loc = await exploreLocation();
  const board = await createBoard(uid, parsed.data.name, { id: loc.id, name: loc.name, currency: loc.currency }, parsed.data.eventId);
  return NextResponse.json({ board }, { status: 201 });
}
