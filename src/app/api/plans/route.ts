import { NextResponse } from "next/server";
import { currentUid } from "@/lib/server/identity";
import { PlanError, SavePlanSchema, savePlan } from "@/lib/server/plans";

/** Save a planner option as one of your plans. */
export async function POST(req: Request) {
  const parsed = SavePlanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  try {
    return NextResponse.json({ plan: await savePlan(await currentUid(), parsed.data) }, { status: 201 });
  } catch (e) {
    if (e instanceof PlanError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
