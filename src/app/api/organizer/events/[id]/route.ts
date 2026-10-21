import { NextResponse } from "next/server";
import { EventInputSchema, InventoryConflict, currentOrg, saveEvent } from "@/lib/server/organizer";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: "Sign in as an organizer first." }, { status: 401 });
  const parsed = EventInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fix the highlighted fields.", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  try {
    return NextResponse.json(await saveEvent(org.id, parsed.data, (await params).id));
  } catch (e) {
    if (e instanceof InventoryConflict) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
