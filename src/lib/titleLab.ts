/**
 * Title lab (pure). Chooses which title + hook an event card shows, LOLA-style
 * (Ye, Yoganarasimhan & Zheng, arXiv 2406.02611):
 *   - An LLM's predicted appeal for each variant becomes a prior worth `priorWeight` pseudo-impressions.
 *   - A UCB rule allocates impressions, one bandit per taste cluster (our extension).
 *   - The reward is bookings once a cluster has `minBookings` of them; before that, clicks stand in.
 * Also: deterministic copy guardrails, a synthetic-audience simulation (bandit vs equal split on the
 * same users), and a plain-language insight built only from the numbers. See docs/TITLE_LAB.md.
 */
import { seededRng, type Rng } from "./bandit";

export type AnchorKind = "for-fans-of" | "performer" | "film" | "tag" | "control";
export type Anchor = { kind: AnchorKind; qlooId?: string; name?: string };
export type Counts = { impressions: number; clicks: number; bookings: number };
export type Metric = "bookings" | "clicks";
export type UcbConfig = { priorWeight: number; exploration: number; minBookings: number };

export const DEFAULT_UCB: UcbConfig = { priorWeight: 20, exploration: 0.5, minBookings: 10 };
export const TITLE_MAX = 60;
export const HOOK_MAX = 110;

/** Appeal (0–1) mapped onto a plausible click rate of 2–12%; bookings assume 20% of clicks book. */
export const CLICK_FLOOR = 0.02;
export const CLICK_RANGE = 0.1;
export const BOOK_PER_CLICK = 0.2;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const zeroCounts = (): Counts => ({ impressions: 0, clicks: 0, bookings: 0 });

export function priorRate(appeal: number, metric: Metric) {
  const ctr = CLICK_FLOOR + CLICK_RANGE * clamp(Number.isFinite(appeal) ? appeal : 0.5, 0, 1);
  return metric === "clicks" ? ctr : ctr * BOOK_PER_CLICK;
}

/** Bookings are the goal; until a cluster has enough of them, clicks are the fallback signal. */
export const metricFor = (counts: Counts[], cfg: UcbConfig = DEFAULT_UCB): Metric => (counts.reduce((n, c) => n + c.bookings, 0) >= cfg.minBookings ? "bookings" : "clicks");

/* ── UCB with prior pseudo-observations ──────────────────────────── */

export type UcbArm = { id: string; appeal: number; counts: Counts };
export type UcbScore = { id: string; mean: number; bonus: number; index: number };

/**
 * Each arm starts with `priorWeight` pseudo-impressions at its prior rate, then real outcomes are added:
 *   mean  = (w·prior + successes) / (w + n)
 *   bonus = c · sqrt(2 · v · ln N / (w + n)),  v = max(mean·(1−mean), 0.01),  N = Σ(w + n)
 * The variance term keeps the bonus on the same scale as single-digit click rates (plain UCB1's
 * bonus would swamp them and explore almost uniformly at this traffic).
 */
export function ucbScores(arms: UcbArm[], cfg: UcbConfig = DEFAULT_UCB): { metric: Metric; scores: UcbScore[] } {
  const metric = metricFor(arms.map((a) => a.counts), cfg);
  const w = Math.max(0, cfg.priorWeight);
  const total = arms.reduce((n, a) => n + w + a.counts.impressions, 0);
  const lnN = Math.log(Math.max(total, 2));
  const scores = arms.map((a) => {
    const n = w + a.counts.impressions;
    if (n === 0) return { id: a.id, mean: 0, bonus: Infinity, index: Infinity };
    const successes = metric === "bookings" ? a.counts.bookings : a.counts.clicks;
    const mean = (w * priorRate(a.appeal, metric) + successes) / n;
    const bonus = cfg.exploration * Math.sqrt((2 * Math.max(mean * (1 - mean), 0.01) * lnN) / n);
    return { id: a.id, mean, bonus, index: mean + bonus };
  });
  return { metric, scores };
}

/** Index of the arm with the highest UCB index; ties broken at random. */
export function ucbPick(arms: UcbArm[], cfg: UcbConfig = DEFAULT_UCB, rng: Rng = Math.random): number {
  const { scores } = ucbScores(arms, cfg);
  const best = Math.max(...scores.map((s) => s.index));
  const tied = scores.flatMap((s, i) => (s.index === best || (best !== Infinity && Math.abs(s.index - best) < 1e-12) ? [i] : []));
  return tied[Math.floor(rng() * tied.length)];
}

/* ── Guardrails (deterministic; the server adds an LLM review) ───── */

const URGENCY = /\b(hurry|last chance|selling fast|sell(?:s|ing)? out|sold out soon|only \d+|\d+ (?:seats |tickets |spots )?left|limited|don'?t miss|act now|book now|tonight only|while (?:they|it) lasts?|exclusive|once in a lifetime|unmissable|best\b|#1|award|guaranteed|discount|% off|deal|free gift)/i;
const INVOLVEMENT = /\b(live|perform\w*|plays?|playing|played|featur\w*|feat\.?|ft\.?|starring|stars|presents?|presented|hosted|hosts?|headlin\w*|guest\w*|appear\w*|sings?|singing|tribute|covers?|in concert|on stage|meet|with)\b/i;
const FANS_PHRASE = /\b(for fans of|fans of|if you liked|if you like|if you love|if you loved)\b/i;

export type GuardContext = {
  /** Lower-cased text of everything the event data supports (listing facts, performers, film, tag names). */
  factText: string;
  /** Names Qloo links as audience references only: never performing or involved. */
  referenceNames: string[];
};

export function guardrailIssues(v: { title: string; hook: string }, ctx: GuardContext): string[] {
  const issues: string[] = [];
  const title = v.title.trim();
  const hook = v.hook.trim();
  if (!title) issues.push("Title is empty.");
  if (title.length > TITLE_MAX) issues.push(`Title is ${title.length} characters (max ${TITLE_MAX}).`);
  if (!hook) issues.push("Hook is empty.");
  if (hook.length > HOOK_MAX) issues.push(`Hook is ${hook.length} characters (max ${HOOK_MAX}).`);
  for (const text of [title, hook]) {
    const urgent = text.match(URGENCY);
    if (urgent) issues.push(`Uses urgency or hype (“${urgent[0]}”).`);
    for (const name of ctx.referenceNames) {
      if (!text.toLowerCase().includes(name.toLowerCase())) continue;
      if (!FANS_PHRASE.test(text)) issues.push(`Mentions ${name} without “for fans of” / “if you liked” phrasing.`);
      const verb = text.match(INVOLVEMENT);
      if (verb) issues.push(`Could imply ${name} is involved (“${verb[0]}”).`);
      if (new RegExp(`${escapeRe(name)}['’]s\\b`, "i").test(text)) issues.push(`Possessive “${name}'s” implies involvement.`);
    }
    for (const n of text.match(/\d[\d,.:]*/g) ?? []) if (!ctx.factText.includes(n.toLowerCase())) issues.push(`Number “${n}” isn't in the event data.`);
    const allowed = [ctx.factText, ...ctx.referenceNames.map((r) => r.toLowerCase())].join(" ");
    for (const n of text.match(/\b[A-Z][\w’']+(?: [A-Z][\w’']+)+\b/g) ?? []) if (!allowed.includes(n.toLowerCase()) && !titleCaseOfFacts(n, allowed)) issues.push(`Name “${n}” isn't in the event data.`);
  }
  return [...new Set(issues)];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Title Case phrases like "Acoustic Evening At The Attic" pass when each word appears in the facts. */
const titleCaseOfFacts = (phrase: string, allowed: string) => phrase.split(" ").every((w) => allowed.includes(w.toLowerCase().replace(/['’]s$/, "")));

/* ── Simulation (synthetic only) ─────────────────────────────────── */

export type SimInput = {
  variants: { id: string; priors: Record<string, number> }[];
  clusters: { id: string; weight: number }[];
  /** Qloo affinity (0–1) of each cluster's reference to each variant's anchor. */
  affinity: Record<string, Record<string, number>>;
  users?: number;
  seed?: number;
  cfg?: UcbConfig;
  noise?: number;
};
export const NEAR_TIE = 0.005;
export type SimPoint = { step: number; banditBest: number; abBest: number; shares: Record<string, number> };
export type SimArmResult = { clicks: number; bookings: number; perVariant: Record<string, Counts> };
export type SimResult = {
  users: number;
  bestByCluster: Record<string, string>;
  /** Variants within NEAR_TIE of the cluster's best expected click rate (Qloo often ties anchors). */
  topByCluster: Record<string, string[]>;
  expectedCtr: Record<string, Record<string, number>>;
  bandit: SimArmResult;
  /** The bandit's counts per cluster → variant (stored as simulated variant_events rows). */
  banditByCluster: Record<string, Record<string, Counts>>;
  equalSplit: SimArmResult;
  series: SimPoint[];
};

function gaussian(rng: Rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * Synthetic visitors: each belongs to one taste cluster. Click probability =
 * CLICK_FLOOR + CLICK_RANGE · affinity(cluster, variant anchor) + per-visitor noise. A click books
 * with probability BOOK_PER_CLICK · (0.5 + affinity). The bandit and an equal-split A/B test see the
 * same visitors and the same random draws (common random numbers), so the comparison is fair.
 */
export function simulateTitleLab(input: SimInput): SimResult {
  const users = input.users ?? 2000;
  const cfg = input.cfg ?? DEFAULT_UCB;
  const rng = seededRng(input.seed ?? 1);
  const ids = input.variants.map((v) => v.id);
  const aff = (c: string, v: string) => clamp(input.affinity[c]?.[v] ?? 0.5, 0, 1);
  const expectedCtr = Object.fromEntries(input.clusters.map((c) => [c.id, Object.fromEntries(ids.map((v) => [v, CLICK_FLOOR + CLICK_RANGE * aff(c.id, v)]))]));
  const bestByCluster = Object.fromEntries(input.clusters.map((c) => [c.id, ids.reduce((b, v) => (expectedCtr[c.id][v] > expectedCtr[c.id][b] ? v : b), ids[0])]));
  const topByCluster = Object.fromEntries(input.clusters.map((c) => [c.id, ids.filter((v) => expectedCtr[c.id][v] >= expectedCtr[c.id][bestByCluster[c.id]] - NEAR_TIE)]));
  const totalWeight = input.clusters.reduce((n, c) => n + c.weight, 0) || 1;

  const empty = (): SimArmResult => ({ clicks: 0, bookings: 0, perVariant: Object.fromEntries(ids.map((v) => [v, zeroCounts()])) });
  const bandit = empty();
  const equalSplit = empty();
  const perCluster: Record<string, Record<string, Counts>> = Object.fromEntries(input.clusters.map((c) => [c.id, Object.fromEntries(ids.map((v) => [v, zeroCounts()]))]));
  const series: SimPoint[] = [];
  const window = Math.max(20, Math.round(users / 10));
  const every = Math.max(10, Math.round(users / 20));
  const recent: { bandit: boolean; ab: boolean }[] = [];

  for (let i = 0; i < users; i++) {
    let r = rng() * totalWeight;
    const cluster = input.clusters.find((c) => (r -= c.weight) < 0)?.id ?? input.clusters[input.clusters.length - 1].id;
    // This visitor's outcome for every variant, drawn once and shared by both policies.
    const outcome = Object.fromEntries(
      ids.map((v) => {
        const p = clamp(expectedCtr[cluster][v] + gaussian(rng) * (input.noise ?? 0.02), 0.002, 0.6);
        const click = rng() < p;
        const book = click && rng() < BOOK_PER_CLICK * (0.5 + aff(cluster, v));
        return [v, { click, book }];
      }),
    );
    const record = (res: SimArmResult, v: string) => {
      const o = outcome[v];
      res.perVariant[v].impressions++;
      if (o.click) {
        res.clicks++;
        res.perVariant[v].clicks++;
      }
      if (o.book) {
        res.bookings++;
        res.perVariant[v].bookings++;
      }
    };
    const arms = input.variants.map((v) => ({ id: v.id, appeal: v.priors[cluster] ?? 0.5, counts: perCluster[cluster][v.id] }));
    const pick = ids[ucbPick(arms, cfg, rng)];
    record(bandit, pick);
    const pc = perCluster[cluster][pick];
    pc.impressions++;
    if (outcome[pick].click) pc.clicks++;
    if (outcome[pick].book) pc.bookings++;
    const abPick = ids[i % ids.length];
    record(equalSplit, abPick);

    recent.push({ bandit: topByCluster[cluster].includes(pick), ab: topByCluster[cluster].includes(abPick) });
    if (recent.length > window) recent.shift();
    if ((i + 1) % every === 0 || i === users - 1) {
      const n = i + 1;
      series.push({
        step: n,
        banditBest: recent.filter((x) => x.bandit).length / recent.length,
        abBest: recent.filter((x) => x.ab).length / recent.length,
        shares: Object.fromEntries(ids.map((v) => [v, bandit.perVariant[v].impressions / n])),
      });
    }
  }
  return { users, bestByCluster, topByCluster, expectedCtr, bandit, banditByCluster: perCluster, equalSplit, series };
}

/* ── Insight (numbers only) ──────────────────────────────────────── */

export const MIN_IMPRESSIONS_FOR_LEADER = 30;

export type ClusterReport = { label: string; metric: Metric; impressions: number; leader?: { title: string; rate: number; average: number } };

/** Leader in a cluster = highest observed rate on the cluster's current metric, once every variant shown there has 30+ impressions. */
export function clusterLeader(rows: { title: string; counts: Counts }[], metric: Metric): ClusterReport["leader"] {
  const shown = rows.filter((r) => r.counts.impressions > 0);
  if (shown.length < 2 || shown.some((r) => r.counts.impressions < MIN_IMPRESSIONS_FOR_LEADER)) return undefined;
  const rate = (c: Counts) => (metric === "bookings" ? c.bookings : c.clicks) / c.impressions;
  const imp = shown.reduce((n, r) => n + r.counts.impressions, 0);
  const average = shown.reduce((n, r) => n + (metric === "bookings" ? r.counts.bookings : r.counts.clicks), 0) / imp;
  const top = shown.reduce((b, r) => (rate(r.counts) > rate(b.counts) ? r : b));
  return { title: top.title, rate: rate(top.counts), average };
}

const pctText = (x: number) => `${(x * 100).toFixed(1)}%`;

/** One plain-English sentence computed from the report numbers only. */
export function insightLine(totalImpressions: number, clusters: ClusterReport[]): string {
  if (totalImpressions === 0) return "No card impressions yet, so there's nothing to compare.";
  const led = clusters.filter((c) => c.leader && c.leader.rate > c.leader.average).sort((a, b) => b.impressions - a.impressions);
  if (!led.length) {
    const biggest = Math.max(...clusters.map((c) => c.impressions));
    return `${totalImpressions} impression${totalImpressions === 1 ? "" : "s"} so far; no cluster has enough data (${MIN_IMPRESSIONS_FOR_LEADER}+ impressions per variant) to name a leader yet${biggest ? ` (largest cluster: ${biggest})` : ""}.`;
  }
  const c = led[0];
  const what = c.metric === "bookings" ? "book from" : "click";
  const rest = clusters.length - led.length;
  return `${c.label} ${what} “${c.leader!.title}” most (${pctText(c.leader!.rate)} vs ${pctText(c.leader!.average)} across that cluster's variants)${rest > 0 ? `; ${rest} other cluster${rest === 1 ? " is" : "s are"} still too early to call` : ""}.`;
}
