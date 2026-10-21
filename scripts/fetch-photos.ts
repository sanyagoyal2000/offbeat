/**
 * Downloads freely licensed photos from Wikimedia Commons for sample events and restaurants,
 * saves compressed copies to public/images/events/ and writes credits to data/photo-credits.json.
 * Only public-domain, CC0, CC BY and CC BY-SA images are used; every one is credited in the app.
 * Run: npm run photos:fetch   (then npm run catalog:generate)
 *
 * Generic scene queries are used on purpose: photos must not imply a named real performer
 * is appearing at a fictional event. Titles are printed so a human can review the picks.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const UA = "OffbeatDemo/1.0 (sample event photos; local development)";
const OUT_DIR = "public/images/events";
const ALLOWED = /^(public domain|cc0|cc by(-sa)? [1-4]\.0|cc by(-sa)? [1-4]\.0 [a-z]+|pdm|no restrictions)/i;

/** slot → [search query, alt text]. Order matters only for de-duplication. */
export const SLOTS: Record<string, [string[], string]> = {
  "acoustic-sundowner": [["guitarist silhouette stage", "acoustic guitar performance", "unplugged concert"], "Musician with an acoustic guitar on stage"],
  "folk-fables-night": [["folk music concert", "folk band performing", "folk festival stage"], "Folk musicians performing"],
  "neon-district-live": [["laser show concert", "nightclub lights", "DJ booth lights"], "Coloured lights at an electronic gig"],
  "carnatic-under-the-stars": [["carnatic concert", "carnatic music", "carnatic violin"], "Carnatic music concert"],
  "jazz-at-the-attic": [["jazz trio", "jazz piano concert"], "Jazz trio playing in a small club"],
  "skyline-parade-live": [["music festival main stage", "concert stage lights crowd", "arena concert lights"], "Large concert crowd facing a lit stage"],
  "late-night-open-mic": [["microphone on stage", "stage microphone", "singer microphone bar"], "Microphone on a small stage"],
  "crowd-work-chronicles": [["comedy show audience", "audience laughing", "theatre audience"], "Audience at a comedy show"],
  "the-last-train-home": [["theatre performance stage", "drama performance actors", "stage play"], "Actors performing a drama on stage"],
  "monsoon-letters": [["black box theatre", "theatre stage small", "studio theatre"], "Small studio theatre stage"],
  "two-chairs-one-table": [["theatre rehearsal", "actors rehearsal stage", "play rehearsal"], "Actors rehearsing on a bare stage"],
  "storytellers-circle": [["people sitting in circle", "audience listening talk", "campfire storytelling"], "People listening to a storyteller"],
  "close-up-magic-hour": [["card trick hands", "playing cards hands", "magician hands"], "Close-up card magic"],
  "pottery-wheel-basics": [["pottery wheel", "potter's wheel", "wheel throwing"], "Hands shaping clay on a potter's wheel"],
  "pottery-handbuilding-evening": [["clay sculpting hands", "pottery workshop", "pinch pot"], "Hands shaping clay"],
  "songwriting-lab": [["guitar and sheet music", "guitarist writing", "music notation guitar"], "Guitar and sheet music"],
  "block-printing-afternoon": [["block printing", "hand block printing"], "Wooden blocks used for textile printing"],
  "sunrise-ridge-trek": [["Nandi Hills sunrise", "sunrise trek", "Savandurga"], "View at sunrise from a hill near Bengaluru"],
  "indie-listeners-club": [["vinyl records listening", "turntable vinyl"], "Vinyl record on a turntable"],
  "board-game-night": [["board games", "board game cafe", "playing board game"], "People playing board games at a table"],
  "puppet-theatre-for-kids": [["kathputli", "string puppets", "puppet show"], "Traditional string puppets"],
  "sunday-five-a-side": [["five-a-side football", "futsal", "amateur football match"], "Five-a-side football on an artificial pitch"],
  "canal-house-jazz": [["jazz saxophone", "saxophonist stage", "jazz concert club"], "Jazz musicians with saxophone"],
  "hackney-folk-cellar": [["pub music session", "folk session pub", "acoustic guitar pub"], "Musicians playing in a pub"],
  "wheel-throwing-taster-ldn": [["ceramics class", "pottery class", "ceramics studio"], "Ceramics class at potter's wheels"],
  "chilterns-day-hike": [["Chiltern Hills", "Chilterns beech wood", "Chiltern footpath"], "Footpath through the Chiltern Hills"],
  "midsummer-ldn": [["Midsummer Night's Dream production stage", "Shakespeare theatre production", "open air theatre performance"], "A Shakespeare play in performance"],
  "improv-jam-ldn": [["theatre actors performing", "comedy theatre stage", "theatre performance actors stage"], "Performers on stage"],
  "greenpoint-indie-night": [["band performing small venue", "rock band stage club", "guitarist band stage lights"], "Band playing a small venue"],
  "night-train-albany-ny": [["proscenium stage", "theatre stage set design production", "stage play actors scene"], "A theatre stage"],
  "les-standup-showcase": [["microphone close up", "microphone", "microphone stand"], "A microphone on stage"],
  "ceramics-date-night-ny": [["pottery class students", "ceramics workshop students", "clay class"], "A ceramics class"],
  "hudson-valley-hike": [["Hudson Highlands", "Breakneck Ridge", "Storm King Mountain"], "View over the Hudson Highlands"],
  "west-village-book-club": [["stack of books", "books on shelf", "open book table"], "Books on a table"],
  "food-cafe": [["filter coffee dosa", "masala dosa", "South Indian breakfast"], "South Indian coffee and food"],
  "food-bistro": [["plated dinner restaurant", "fine dining dish", "restaurant dish plate"], "A plated restaurant dish"],
  "food-noodles": [["bowl of noodles", "ramen bowl", "pho bowl"], "A bowl of noodles"],
  "food-pizza": [["pizza margherita", "pizza slice", "pizza oven"], "A pizza"],
  "food-biryani": [["biryani", "hyderabadi biryani", "biryani plate"], "A plate of biryani"],
};

/** Place names allowed in titles for outdoor slots. */
const ALLOW_NAMES: Record<string, string[]> = {
  "sunrise-ridge-trek": ["Nandi", "Savandurga", "Skandagiri", "Karnataka", "Bangalore", "Bengaluru"],
  "chilterns-day-hike": ["Chiltern", "Chilterns", "Buckinghamshire", "Oxfordshire", "England"],
  "hudson-valley-hike": ["Hudson", "Highlands", "Breakneck", "Ridge", "Storm", "King", "Cold", "Spring", "York"],
  "carnatic-under-the-stars": ["Carnatic", "Chennai", "Kerala"],
  "puppet-theatre-for-kids": ["Kathputli", "Rajasthan", "Rajasthani"],
};
/** Title must mention the subject, so off-topic images (e.g. a shop) aren't picked. */
const TOPIC: Record<string, RegExp> = {
  "pottery-wheel-basics": /potter|wheel|clay|ceramic/i,
  "pottery-handbuilding-evening": /pot|clay|ceramic/i,
  "wheel-throwing-taster-ldn": /potter|wheel|clay|ceramic/i,
  "block-printing-afternoon": /block|print/i,
  "board-game-night": /game/i,
  "puppet-theatre-for-kids": /puppet|kathputli/i,
  "the-last-train-home": /theat|play|stage|drama|perform/i,
  "midsummer-ldn": /theat|stage|perform|play|shakespeare/i,
  "two-chairs-one-table": /theat|stage|rehears|play/i,
  "night-train-albany-ny": /stage|scene|theat/i,
  "monsoon-letters": /theat|stage/i,
  "west-village-book-club": /book|read|librar/i,
  "late-night-open-mic": /micro/i,
  "les-standup-showcase": /microphone/i,
  "close-up-magic-hour": /card|magic/i,
  "ceramics-date-night-ny": /pottery|ceramic|clay/i,
  "food-pizza": /pizza/i,
  "indie-listeners-club": /vinyl|record|turntable/i,
};

type Page = { title: string; imageinfo?: { thumburl?: string; width: number; height: number; descriptionurl: string; extmetadata: Record<string, { value: string }> }[] };
const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Words that are fine when capitalised in a file title (not personal names). */
const GENERIC = new Set(
  "The A An Of At In On And With For By To From Live Music Festival Folk Jazz Band Club Concert Stage Theatre Theater Comedy Night Day Open Mic Hall Studio Pottery Ceramic Ceramics Class Workshop Wheel Clay Hills Hill Wood Woods Park River Valley Trail Lake Indian India Traditional Street Food Coffee Restaurant Cafe Board Game Games Football Pitch Turf Puppet Puppets Show Book Club Reading Group Library Interior Auditorium Vinyl Record Records Dosa Biryani Masala Noodle Noodles Pizza Ramen Pho Breakfast Dinner South North New Old International Rock Indie Acoustic Guitar Piano Saxophone Trio Quartet Mountain Mountains Sunrise Sunset View".split(" "),
);

/**
 * True when the title looks like it names a person (two adjacent capitalised words that aren't
 * generic or explicitly allowed places). Used to avoid photos of identifiable named performers.
 */
function namesSomeone(title: string, allowed: string[]): boolean {
  const words = title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/\(.*?\)/g, " ").split(/[^A-Za-zÀ-ÿ']+/).filter(Boolean);
  const ok = (w: string) => GENERIC.has(w) || allowed.some((a) => a.toLowerCase() === w.toLowerCase()) || w === w.toLowerCase() || w === w.toUpperCase();
  for (let i = 0; i < words.length - 1; i++) if (!ok(words[i]) && !ok(words[i + 1])) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function candidates(query: string): Promise<Page[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await search(query);
    } catch {
      await sleep(2000 * (attempt + 1)); // back off if Commons throttles
    }
  }
  return [];
}

async function search(query: string): Promise<Page[]> {
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: "25",
    prop: "imageinfo",
    iiprop: "url|extmetadata|size",
    iiurlwidth: "1280",
    format: "json",
  })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { error?: unknown; query?: { pages?: Record<string, Page & { index: number }> } };
  if (body.error) throw new Error("API error");
  return Object.values(body.query?.pages ?? {}).sort((a, b) => (a as { index: number }).index - (b as { index: number }).index);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const creditsPath = "data/photo-credits.json";
  const credits: Record<string, unknown> = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, "utf8")).photos : {};
  const skip = new Set((process.env.SKIP_FILES ?? "").split("|").filter(Boolean));
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
  const used = new Set(Object.values(credits).map((c) => (c as { title: string }).title));

  for (const [slot, [queries, alt]] of Object.entries(SLOTS)) {
    if (only && !only.has(slot)) continue;
    if (!only && credits[slot]) continue;
    let pick: Page | undefined;
    for (const query of queries) {
      const pages = await candidates(query);
      pick = pages.find((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl || used.has(p.title) || skip.has(p.title)) return false;
      if (namesSomeone(p.title, ALLOW_NAMES[slot] ?? [])) return false;
      if (TOPIC[slot] && !TOPIC[slot].test(p.title)) return false;
      const lic = strip(ii.extmetadata.LicenseShortName?.value);
      const ratio = ii.width / ii.height;
      return ALLOWED.test(lic) && ii.width >= 1000 && ratio >= 1.2 && ratio <= 2.2;
      });
      if (pick) break;
      await sleep(800);
    }
    if (!pick) {
      console.log(`none       ${slot}  (${queries.join(" / ")})`);
      continue;
    }
    const ii = pick.imageinfo![0];
    const raw = `${OUT_DIR}/${slot}.raw`;
    const res = await fetch(ii.thumburl!, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      console.log(`failed     ${slot}  HTTP ${res.status}`);
      continue;
    }
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
    // Re-encode at 1280px wide, ~80% quality, to keep the app light.
    execFileSync("python3", ["-c", `from PIL import Image; im=Image.open("${raw}").convert("RGB"); im.thumbnail((1280,1280)); im.save("${OUT_DIR}/${slot}.jpg", quality=80, optimize=True)`]);
    execFileSync("rm", [raw]);
    used.add(pick.title);
    credits[slot] = {
      src: `/images/events/${slot}.jpg`,
      alt,
      title: pick.title,
      author: strip(ii.extmetadata.Artist?.value) || "Unknown author",
      license: strip(ii.extmetadata.LicenseShortName?.value),
      licenseUrl: ii.extmetadata.LicenseUrl?.value ?? null,
      source: ii.descriptionurl,
    };
    writeFileSync(creditsPath, JSON.stringify({ _note: "Photos from Wikimedia Commons under free licenses. Generated by scripts/fetch-photos.ts. Credit is shown in the app.", photos: credits }, null, 1));
    console.log(`ok         ${slot.padEnd(30)} ${pick.title.slice(5, 80)}  [${strip(ii.extmetadata.LicenseShortName?.value)}]`);
    await sleep(1200);
  }
  writeFileSync(creditsPath, JSON.stringify({ _note: "Photos from Wikimedia Commons under free licenses. Generated by scripts/fetch-photos.ts. Credit is shown in the app.", photos: credits }, null, 1));
}

main();
