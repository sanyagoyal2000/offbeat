import "server-only";
import { cookies } from "next/headers";
import { EXPLORE_COOKIE, HOME_COOKIE, DEFAULT_LOCATION_ID, cityById, parseLocationCookie, type Location } from "@/lib/locations";

export async function currentUid(): Promise<string> {
  const c = await cookies();
  const uid = c.get("ob_uid")?.value;
  if (!uid) throw new Error("Missing visitor id");
  return uid;
}

/** The place being explored (may differ from home). Defaults to the first sample city. */
export async function exploreLocation(): Promise<Location> {
  const c = await cookies();
  return parseLocationCookie(c.get(EXPLORE_COOKIE)?.value) ?? cityById(DEFAULT_LOCATION_ID)!;
}

export async function homeLocation(): Promise<Location | null> {
  const c = await cookies();
  return parseLocationCookie(c.get(HOME_COOKIE)?.value);
}
