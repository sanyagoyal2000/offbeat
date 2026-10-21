/**
 * LLM access for drafting copy. Provider (LLM_PROVIDER):
 *   - "anthropic": Anthropic API (needs ANTHROPIC_API_KEY). Works on hosted deployments.
 *   - "claude-cli": the local Claude Code CLI in print mode. Default fallback locally; never used on Vercel.
 *   - "none": callers use their deterministic fallback (default on hosted builds without a key).
 * Every caller must validate the output and fall back when this returns null.
 */
import "server-only";
import { spawn } from "node:child_process";

export type LlmProvider = "anthropic" | "claude-cli" | "none";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

/**
 * Order: Anthropic API when ANTHROPIC_API_KEY is set; otherwise, on local machines only, the
 * Claude Code CLI as a fallback. Hosted builds (VERCEL) never use the CLI. LLM_PROVIDER can force
 * "none", "anthropic" or "claude-cli".
 */
export function llmProvider(): LlmProvider {
  const forced = process.env.LLM_PROVIDER;
  const local = !process.env.VERCEL;
  if (forced === "none") return "none";
  if (forced === "claude-cli") return local ? "claude-cli" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "none";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return local ? "claude-cli" : "none";
}

async function viaApi(prompt: string, timeoutMs: number): Promise<string | null> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: timeoutMs });
  const msg = await client.messages.create({ model: MODEL, max_tokens: 1500, messages: [{ role: "user", content: prompt }] });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

function viaCli(prompt: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["-p", prompt, "--output-format", "json"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(null);
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve((JSON.parse(out) as { result?: string }).result ?? null);
      } catch {
        resolve(null);
      }
    });
  });
}

/** Ask for JSON; returns the parsed object or null (provider off, timeout, or invalid JSON). */
export async function llmJson<T>(prompt: string, timeoutMs = 60000): Promise<T | null> {
  const provider = llmProvider();
  if (provider === "none") return null;
  try {
    let text: string | null = null;
    if (provider === "anthropic") {
      // Locally, fall back to the Claude Code CLI if the API call fails.
      text = await viaApi(prompt, timeoutMs).catch(() => null);
      if (!text && !process.env.VERCEL) text = await viaCli(prompt, timeoutMs);
    } else text = await viaCli(prompt, timeoutMs);
    if (!text) return null;
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
