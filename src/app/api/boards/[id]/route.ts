import { NextResponse } from "next/server";
import { z } from "zod";
import { ParticipantSchema, applyBoardAction, getBoard } from "@/lib/server/boards";
import { getEvent } from "@/lib/server/catalog";
import { currentUser } from "@/lib/server/identity";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = await getBoard((await params).id);
  return b ? NextResponse.json({ board: b }) : NextResponse.json({ error: "Board not found" }, { status: 404 });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join") }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("add"), eventId: z.string() }),
  z.object({ action: z.literal("remove"), eventId: z.string() }),
  z.object({ action: z.literal("vote"), eventId: z.string(), on: z.boolean() }),
  z.object({ action: z.literal("rename"), name: z.string().min(1).max(60) }),
  z.object({ action: z.literal("me"), me: ParticipantSchema }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const a = parsed.data;
  const { uid, account } = await currentUser();
  if (!account) return NextResponse.json({ error: "Log in or create an account to join this board.", code: "login" }, { status: 401 });
  if ((a.action === "add" || a.action === "vote") && !(await getEvent(a.eventId))) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const r = await applyBoardAction(id, uid, a);
  if (r.ok) return NextResponse.json({ board: r.board });
  if (r.reason === "not-member") return NextResponse.json({ error: "Join this board first.", code: "join" }, { status: 403 });
  if (r.reason === "owner-cant-leave") return NextResponse.json({ error: "You created this board, so you can't leave it." }, { status: 409 });
  return NextResponse.json({ error: "Board not found" }, { status: 404 });
}
