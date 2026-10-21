import { NextResponse } from "next/server";
import { z } from "zod";
import { EXPLORE_COOKIE, HOME_COOKIE, LocationSchema } from "@/lib/locations";

const Body = z.object({ kind: z.enum(["explore", "home"]), location: LocationSchema });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(parsed.data.kind === "home" ? HOME_COOKIE : EXPLORE_COOKIE, encodeURIComponent(JSON.stringify(parsed.data.location)), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
