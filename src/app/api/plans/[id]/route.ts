import { NextResponse } from "next/server";
import { currentUid } from "@/lib/server/identity";
import { removePlan } from "@/lib/server/plans";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await removePlan(await currentUid(), (await params).id);
  return NextResponse.json({ ok: true });
}
