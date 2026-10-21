import { NextResponse } from "next/server";
import { cityById } from "@/lib/locations";
import { AuthError, SignupSchema, createSession, signUp } from "@/lib/server/auth";
import { setSessionCookie } from "@/lib/server/sessionCookie";

export async function POST(req: Request) {
  const parsed = SignupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form", field: parsed.error.issues[0]?.path.join(".") }, { status: 400 });
  if (!cityById(parsed.data.cityId)) return NextResponse.json({ error: "Choose a city", field: "cityId" }, { status: 400 });
  try {
    const account = await signUp(parsed.data, (id) => ({ id, name: parsed.data.orgName, cityId: parsed.data.cityId, about: "" }));
    const session = await createSession(account.id);
    const res = NextResponse.json({ ok: true }, { status: 201 });
    setSessionCookie(res, session.token);
    return res;
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message, field: "email" }, { status: 409 });
    throw e;
  }
}
