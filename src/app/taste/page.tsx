import { after } from "next/server";
import { currentUid, exploreLocation, homeLocation } from "@/lib/server/identity";
import { tasteSuggestions } from "@/lib/server/suggestions";
import { getTaste, vibeTags } from "@/lib/server/taste";
import { qlooConfigured } from "@/lib/server/qloo";
import { TasteEditor } from "./TasteEditor";

export default async function TastePage() {
  const [taste, home, explore] = await Promise.all([getTaste(await currentUid()), homeLocation(), exploreLocation()]);
  // Suggestions come from the database; stale lists refresh after the response is sent.
  const [vibe, suggestions] = await Promise.all([vibeTags(taste.interests), tasteSuggestions(home ?? explore, (task) => after(task))]);
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
      <h1 className="font-display text-[24px] leading-tight">Your interests (optional)</h1>
      <p className="mt-1 max-w-xl text-[14px] text-ivory/75">
        Add artists, films, shows, books or places you love and we&apos;ll order events by how closely they connect, using Qloo&apos;s cultural data. You can browse and book without this.
      </p>
      <TasteEditor initial={taste} initialVibe={vibe} available={qlooConfigured()} suggestions={suggestions} />
    </main>
  );
}
