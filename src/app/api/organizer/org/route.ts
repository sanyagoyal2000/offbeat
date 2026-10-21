import { NextResponse } from "next/server";
import { z } from "zod";
import { cityById } from "@/lib/locations";
import { currentOrg, updateOrg } from "@/lib/server/organizer";

const Edit = z.object({ name: z.string().trim().min(2).max(60), about: z.string().trim().max(300), cityId: z.string() });

export async function POST(req: Request) {
  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: "Sign in as an organizer first." }, { status: 401 });
  const ed = Edit.safeParse(await req.json().catch(() => null));
  if (!ed.success || !cityById(ed.data.cityId)) return NextResponse.json({ error: "Check the organization details" }, { status: 400 });
  if (org.isSample) return NextResponse.json({ error: "Sample organizer profiles are read-only" }, { status: 403 });
  const { account: _a, isSample: _s, ...plain } = org;
  void _a;
  void _s;
  return NextResponse.json({ org: await updateOrg(plain, ed.data) });
}
