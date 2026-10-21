import { NextResponse } from "next/server";
import { WishInputSchema } from "@/lib/wishes";
import { currentUid } from "@/lib/server/identity";
import { createWish, myWishes } from "@/lib/server/wishes";

export async function GET() {
  return NextResponse.json({ wishes: await myWishes(await currentUid()) });
}

export async function POST(req: Request) {
  const parsed = WishInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the highlighted fields.", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  return NextResponse.json({ wish: await createWish(await currentUid(), parsed.data) }, { status: 201 });
}
