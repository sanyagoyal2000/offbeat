/**
 * Drafts Title lab variants for published events and approves them, so Home serves them right away.
 * Normally the organizer reviews variants on /organizer first; this is for demos and testing.
 * Usage: npm run titles:seed [--city=bengaluru-in] [--force] [event-id ...]
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const city = args.find((a) => a.startsWith("--city="))?.slice(7);
  const ids = args.filter((a) => !a.startsWith("--"));
  const { publishedEvents } = await import("../src/lib/server/catalog");
  const { changeTitleLab, createTitleLab, titleLabProvider } = await import("../src/lib/server/titleLab");
  const { closeDb } = await import("../src/lib/server/db/client");
  const events = (await publishedEvents(city)).filter((e) => !ids.length || ids.includes(e.id));
  console.log(`Drafting with: ${titleLabProvider()} · ${events.length} event(s)${force ? " · regenerating" : ""}`);
  for (const e of events) {
    const started = Date.now();
    const lab = await createTitleLab(e, e.organizerId, { force });
    await changeTitleLab(e.id, e.organizerId, { action: "approve-all" });
    console.log(`\n${e.title}  (${e.id}, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
    for (const v of lab.variants) console.log(`  [${v.origin}] ${v.title} — ${v.hook}${v.review.notes.length ? `\n      fell back: ${v.review.notes.join("; ")}` : ""}`);
  }
  closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
