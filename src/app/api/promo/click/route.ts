import { NextResponse } from "next/server";
import { currentUid } from "@/lib/server/identity";
import { recordClick } from "@/lib/server/experiments";

/** Logs a promo-card click, remembers it for reservation attribution (24 h), then opens the event. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const exp = url.searchParams.get("exp") ?? "";
  const variant = url.searchParams.get("v") ?? "";
  const session = url.searchParams.get("session");
  const x = await recordClick(await currentUid(), exp, variant);
  if (!x) return NextResponse.redirect(new URL("/", url));
  const res = NextResponse.redirect(new URL(`/events/${x.eventId}${session ? `?session=${encodeURIComponent(session)}` : ""}`, url));
  res.cookies.set("ob_promo", encodeURIComponent(JSON.stringify({ eventId: x.eventId, experimentId: x.id, variantId: variant })), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  return res;
}
