import { NextResponse, after } from "next/server";
import { EventInputSchema, InventoryConflict, currentOrg, saveEvent } from "@/lib/server/organizer";
import { generateOnPublish } from "@/lib/server/titleLab";

export async function POST(req: Request) {
  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: "Sign in as an organizer first." }, { status: 401 });
  const parsed = EventInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fix the highlighted fields.", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  try {
    const saved = await saveEvent(org.id, parsed.data);
    after(() => generateOnPublish(saved.event, org.id));
    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    if (e instanceof InventoryConflict) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
