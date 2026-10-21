import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentUid } from "@/lib/server/identity";
import { ReservationError, ReservationRequestSchema, createReservation, listReservations } from "@/lib/server/reservations";

export async function GET() {
  return NextResponse.json({ reservations: await listReservations(await currentUid()) });
}

export async function POST(req: Request) {
  const parsed = ReservationRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check your selection.", code: "invalid" }, { status: 400 });
  // Attribute to a promotion only if this visitor clicked a promo card for this event.
  const promoRaw = (await cookies()).get("ob_promo")?.value;
  let promo: { experimentId: string; variantId: string } | undefined;
  try {
    const p = promoRaw ? (JSON.parse(decodeURIComponent(promoRaw)) as { eventId: string; experimentId: string; variantId: string }) : null;
    if (p && p.eventId === parsed.data.eventId) promo = { experimentId: p.experimentId, variantId: p.variantId };
  } catch {}
  try {
    const { reservation, duplicate } = await createReservation(await currentUid(), parsed.data, promo);
    return NextResponse.json({ reservation, duplicate }, { status: duplicate ? 200 : 201 });
  } catch (e) {
    if (e instanceof ReservationError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "not-found" ? 404 : 409 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong. Nothing was reserved; please try again.", code: "error" }, { status: 500 });
  }
}
