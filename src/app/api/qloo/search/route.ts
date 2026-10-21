import { NextResponse } from "next/server";
import { ENTITY_TYPES, QlooUnavailable, disambiguate, searchEntities } from "@/lib/server/qloo";

const TYPES: Record<string, string[]> = {
  all: [ENTITY_TYPES.artist, ENTITY_TYPES.movie, ENTITY_TYPES.book, ENTITY_TYPES.tv_show, ENTITY_TYPES.place],
  artist: [ENTITY_TYPES.artist],
  movie: [ENTITY_TYPES.movie, ENTITY_TYPES.tv_show],
  book: [ENTITY_TYPES.book],
  place: [ENTITY_TYPES.place],
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const type = url.searchParams.get("type") ?? "all";
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    const results = await searchEntities(q.slice(0, 80), TYPES[type] ?? TYPES.all, 8);
    return NextResponse.json({
      results: results.map((e) => ({
        id: e.entity_id,
        name: e.name,
        type: (e.subtype ?? e.types?.[0] ?? "").replace("urn:entity:", ""),
        image: e.properties?.image?.url,
        detail: disambiguate(e),
      })),
    });
  } catch (e) {
    if (e instanceof QlooUnavailable) return NextResponse.json({ error: "Interest search is unavailable right now." }, { status: 503 });
    throw e;
  }
}
