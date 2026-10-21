import { NextResponse } from "next/server";
import { z } from "zod";
import { WishInputSchema } from "@/lib/wishes";
import { currentUid } from "@/lib/server/identity";
import { updateWish } from "@/lib/server/wishes";

const Patch = WishInputSchema.partial().extend({ status: z.enum(["open", "withdrawn"]).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid changes" }, { status: 400 });
  const w = await updateWish(await currentUid(), (await params).id, parsed.data);
  return w ? NextResponse.json({ wish: w }) : NextResponse.json({ error: "Wish not found" }, { status: 404 });
}
