import { NextResponse } from "next/server";
import { z } from "zod";
import { setStatus, simulate } from "@/lib/server/experiments";
import { currentOrg } from "@/lib/server/organizer";

const Body = z.object({ action: z.enum(["start", "stop", "simulate"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: "Sign in as an organizer first." }, { status: 401 });
  const id = (await params).id;
  const x = parsed.data.action === "simulate" ? await simulate(id, org.id, 1000) : await setStatus(id, org.id, parsed.data.action === "start" ? "running" : "stopped");
  return x ? NextResponse.json({ experiment: x }) : NextResponse.json({ error: "Experiment not found" }, { status: 404 });
}
