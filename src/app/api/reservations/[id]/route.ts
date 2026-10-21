import { NextResponse } from "next/server";
import { currentUid } from "@/lib/server/identity";
import { ReservationError, cancelReservation, getReservation } from "@/lib/server/reservations";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await getReservation(await currentUid(), (await params).id);
  return r ? NextResponse.json({ reservation: r }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Cancel releases the seats back to this app's inventory. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ reservation: await cancelReservation(await currentUid(), (await params).id) });
  } catch (e) {
    if (e instanceof ReservationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
