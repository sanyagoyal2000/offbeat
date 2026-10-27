import { NextResponse } from "next/server";
import { z } from "zod";
import { EXPLORE_COOKIE, HOME_COOKIE, LocationSchema } from "@/lib/locations";
import { saveHome } from "@/lib/server/db/users";
import { currentUid } from "@/lib/server/identity";

const Body = z.object({ kind: z.enum(["explore", "home"]), location: LocationSchema });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  const { kind, location } = parsed.data;
  // Home is also stored on the user row (users.home_city/lat/lng); the cookie drives the UI.
  if (kind === "home") await saveHome(await currentUid(), { cityId: location.id, lat: location.lat, lng: location.lng });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(parsed.data.kind === "home" ? HOME_COOKIE : EXPLORE_COOKIE, encodeURIComponent(JSON.stringify(parsed.data.location)), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
