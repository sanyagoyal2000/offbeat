// Force the in-memory store (no files written) and no Qloo/LLM credentials during tests.
process.env.VERCEL = "1";
delete process.env.QLOO_API_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.LLM_PROVIDER;
delete process.env.ANTHROPIC_API_KEY;
