import { NextResponse } from "next/server";
import { z } from "zod";
import { ParticipantSchema, getBoard, updateBoard } from "@/lib/server/boards";
import { getEvent } from "@/lib/server/catalog";
import { currentUid } from "@/lib/server/identity";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = await getBoard((await params).id);
  return b ? NextResponse.json({ board: b }) : NextResponse.json({ error: "Board not found" }, { status: 404 });
}

const Action = z.discriminatedUnion("action", [
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
  const uid = await currentUid();
  if ((a.action === "add" || a.action === "vote") && !(await getEvent(a.eventId))) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const board = await updateBoard(id, uid, (b) => {
    if (a.action === "add" && !b.items.some((i) => i.eventId === a.eventId)) b.items.push({ eventId: a.eventId, addedBy: uid, addedAt: new Date().toISOString() });
    if (a.action === "remove") {
      b.items = b.items.filter((i) => i.eventId !== a.eventId);
      delete b.votes[a.eventId];
    }
    if (a.action === "vote") {
      const set = new Set(b.votes[a.eventId] ?? []);
      if (a.on) set.add(uid);
      else set.delete(uid);
      b.votes[a.eventId] = [...set];
    }
    if (a.action === "rename") b.name = a.name;
    if (a.action === "me") {
      const me = a.me;
      if (me.from && me.to && me.from > me.to) [me.from, me.to] = [me.to, me.from];
      b.participants[uid] = { ...b.participants[uid], ...me };
    }
  });
  return board ? NextResponse.json({ board }) : NextResponse.json({ error: "Board not found" }, { status: 404 });
}
