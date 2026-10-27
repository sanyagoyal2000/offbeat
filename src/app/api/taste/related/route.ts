import { NextResponse } from "next/server";
import { z } from "zod";
import { QlooUnavailable } from "@/lib/server/qloo";
import { moreLikeThis } from "@/lib/server/suggestions";

const Body = z.object({ anchors: z.array(z.object({ id: z.string().min(8).max(80), name: z.string().max(120), type: z.string().max(30) })).max(10) });

/** "More like this": Qloo Insights seeded by every chosen anchor (cached in qloo_cache). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    return NextResponse.json({ items: await moreLikeThis(parsed.data.anchors) });
  } catch (e) {
    if (e instanceof QlooUnavailable) return NextResponse.json({ error: "Suggestions are unavailable right now." }, { status: 503 });
    throw e;
  }
}
