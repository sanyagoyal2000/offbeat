/** Taste-page suggestions repository (interest_suggestions). */
import { and, asc, eq, inArray, min } from "drizzle-orm";
import { db, newId, nowIso, runBatch } from "./client";
import { interestSuggestions } from "./schema";

export type Source = "popular" | "trending" | "starter";
export const STARTER_CITY = "*";
export type SuggestionRow = { id: string; name: string; type: string; image: string | null; indiaMatch: boolean; tab: string; source: Source; fetchedAt: string };

/** Every row for a city plus the global starter rows, in rank order. */
export async function rowsFor(city: string): Promise<SuggestionRow[]> {
  const rows = await db().select().from(interestSuggestions).where(inArray(interestSuggestions.city, [city, STARTER_CITY])).orderBy(asc(interestSuggestions.rank));
  return rows.map((r) => ({ id: r.qlooEntityId, name: r.name, type: r.qlooType, image: r.imageUrl, indiaMatch: r.indiaMatch, tab: r.tab, source: r.source, fetchedAt: r.fetchedAt }));
}

/** Oldest Qloo fetch for a city, or null if it has no Qloo rows yet. */
export async function oldestFetch(city: string): Promise<string | null> {
  const [r] = await db().select({ at: min(interestSuggestions.fetchedAt) }).from(interestSuggestions).where(eq(interestSuggestions.city, city));
  return r?.at ?? null;
}

/** Replaces one (city, tab, source) list in a single transaction. An empty list clears it. */
export async function replaceRows(city: string, tab: string, source: Source, items: { id: string; name: string; type: string; image: string | null; indiaMatch?: boolean }[]) {
  const fetchedAt = nowIso();
  const unique = [...new Map(items.map((i) => [i.id, i])).values()];
  await runBatch([
    db().delete(interestSuggestions).where(and(eq(interestSuggestions.city, city), eq(interestSuggestions.tab, tab), eq(interestSuggestions.source, source))),
    ...(unique.length
      ? [db().insert(interestSuggestions).values(unique.map((i, rank) => ({ id: newId(), city, tab, source, qlooEntityId: i.id, name: i.name, qlooType: i.type, imageUrl: i.image, rank, indiaMatch: !!i.indiaMatch, fetchedAt })))]
      : []),
  ]);
}
