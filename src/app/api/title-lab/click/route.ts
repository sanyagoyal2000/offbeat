import { NextResponse } from "next/server";
import { currentUid } from "@/lib/server/identity";
import { recordTitleLab } from "@/lib/server/titleLab";

/** Logs a click on a Title lab card, remembers it for booking attribution (24 h), then opens the event. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const eventId = url.searchParams.get("e") ?? "";
  const variantId = url.searchParams.get("v") ?? "";
  const clusterId = url.searchParams.get("c") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const dest = to.startsWith(`/events/${eventId}`) ? to : `/events/${encodeURIComponent(eventId)}`;
  const ok = await recordTitleLab("click", eventId, variantId, clusterId, await currentUid());
  const res = NextResponse.redirect(new URL(dest, url));
  if (ok) res.cookies.set("ob_tl", encodeURIComponent(JSON.stringify({ eventId, variantId, clusterId })), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  return res;
}
