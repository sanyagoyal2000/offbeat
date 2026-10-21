import { NextResponse } from "next/server";
import { bookingSessions, sessionSeats } from "@/lib/server/bookingData";
import { getEvent } from "@/lib/server/catalog";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = new URL(req.url).searchParams.get("session");
  return NextResponse.json({ ...(await bookingSessions(event)), taken: session ? await sessionSeats(event, session) : [] }, { headers: { "cache-control": "no-store" } });
}
