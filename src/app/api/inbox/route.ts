import { NextResponse } from "next/server";
import { currentUid } from "@/lib/server/identity";
import { markAllRead } from "@/lib/server/notifications";

export async function POST() {
  await markAllRead(await currentUid());
  return NextResponse.json({ ok: true });
}
