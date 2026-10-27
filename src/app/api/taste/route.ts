import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUid } from "@/lib/server/identity";
import { TooManyAnchors } from "@/lib/server/db/users";
import { getTaste, saveTaste, vibeTags } from "@/lib/server/taste";

const Profile = z.object({
  interests: z.array(z.object({ id: z.string().min(8).max(80), name: z.string().max(120), type: z.string().max(30), image: z.string().url().optional(), detail: z.string().max(200).optional() })).max(20),
  notes: z.array(z.object({ text: z.string().trim().min(1).max(80) })).max(10),
  skipped: z.boolean().optional(),
});

export async function GET() {
  const t = await getTaste(await currentUid());
  return NextResponse.json({ taste: t, vibe: await vibeTags(t.interests) });
}

export async function PUT(req: Request) {
  const parsed = Profile.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid interests" }, { status: 400 });
  try {
    await saveTaste(await currentUid(), parsed.data);
  } catch (e) {
    if (e instanceof TooManyAnchors) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true, vibe: await vibeTags(parsed.data.interests) });
}
