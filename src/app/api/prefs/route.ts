import { NextResponse } from "next/server";
import { currentUid } from "@/lib/server/identity";
import { PrefsSchema, savePrefs } from "@/lib/server/notifications";

export async function PUT(req: Request) {
  const parsed = PrefsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  await savePrefs(await currentUid(), parsed.data);
  return NextResponse.json({ ok: true });
}
