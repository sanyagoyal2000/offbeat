// No Qloo or LLM credentials during tests (the LLM CLI fallback is off when VERCEL is set).
process.env.VERCEL = "1";
delete process.env.QLOO_API_KEY;
delete process.env.LLM_PROVIDER;
delete process.env.ANTHROPIC_API_KEY;

// Every test file starts from the freshly seeded template (file:./test.db), never Turso.
import { copyFileSync, rmSync } from "node:fs";
import { closeDb } from "../src/lib/server/db/client";

closeDb();
for (const f of ["test.db-wal", "test.db-shm", "test.db-journal"]) rmSync(f, { force: true });
copyFileSync("test.template.db", "test.db");
