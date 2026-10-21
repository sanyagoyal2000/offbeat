import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUid } from "@/lib/server/identity";
import { addSavedSearch, removeSavedSearch } from "@/lib/server/savedSearches";

const Body = z.object({ label: z.string().min(1).max(200), query: z.string().max(500), cityId: z.string(), cityName: z.string() });
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return NextResponse.json({ search: await addSavedSearch(await currentUid(), parsed.data) });
}
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) await removeSavedSearch(await currentUid(), id);
  return NextResponse.json({ ok: true });
}
