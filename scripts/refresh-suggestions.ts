/**
 * Fills interest_suggestions for the main cities (and the starter list) from Qloo.
 * Usage: npm run qloo:suggestions [city-id ...]
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const { cityById } = await import("../src/lib/locations");
  const { MAIN_CITY_IDS, loadStarters, refreshCity } = await import("../src/lib/server/suggestions");
  const { closeDb } = await import("../src/lib/server/db/client");
  await loadStarters();
  console.log("Starter picks loaded (city = *).");
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : MAIN_CITY_IDS;
  for (const id of ids) {
    const loc = cityById(id);
    if (!loc) {
      console.log(`Unknown city ${id}, skipped.`);
      continue;
    }
    const started = Date.now();
    const report = await refreshCity(loc);
    console.log(`\n${loc.name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    console.table(report);
  }
  closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
