/**
 * LOLA-inspired variant selection (pure).
 *
 * LOLA (LLM-Assisted Online Learning Algorithm) combines LLM-predicted performance of headline
 * variants with online learning from real clicks. This is a simplified version:
 *   - Each variant's LLM (or heuristic) predicted click rate becomes a Beta prior worth
 *     `priorWeight` pseudo-impressions.
 *   - Selection is Thompson sampling on Beta(prior + observed clicks, prior + observed non-clicks).
 *   - The selection probability of the shown variant is estimated by Monte Carlo and logged with
 *     every impression so results can be interpreted (e.g. inverse-propensity weighting).
 * Differences from the paper: no UCB-style confidence bonus, no learned calibration of the LLM
 * predictions against past experiments, and a fixed prior weight.
 */

export type Arm = { id: string; predictedCtr: number; impressions: number; clicks: number };
export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) so simulations and tests are reproducible. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: Rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Gamma(shape, 1) via Marsaglia–Tsang. */
function gamma(shape: number, rng: Rng): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(rng() || 1e-12, 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = gaussian(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export const betaSample = (a: number, b: number, rng: Rng) => {
  const x = gamma(a, rng);
  return x / (x + gamma(b, rng));
};

export const posterior = (arm: Arm, priorWeight: number) => {
  const p = Math.min(0.99, Math.max(0.001, arm.predictedCtr));
  return { a: p * priorWeight + arm.clicks + 1e-6, b: (1 - p) * priorWeight + Math.max(0, arm.impressions - arm.clicks) + 1e-6 };
};

export function thompsonPick(arms: Arm[], priorWeight: number, rng: Rng): number {
  let best = 0;
  let bestDraw = -1;
  arms.forEach((arm, i) => {
    const { a, b } = posterior(arm, priorWeight);
    const draw = betaSample(a, b, rng);
    if (draw > bestDraw) [best, bestDraw] = [i, draw];
  });
  return best;
}

/** Probability each arm is the one Thompson sampling picks (= P(best) under the posterior). */
export function selectionProbabilities(arms: Arm[], priorWeight: number, rng: Rng, draws = 2000): number[] {
  const wins = new Array(arms.length).fill(0);
  for (let i = 0; i < draws; i++) wins[thompsonPick(arms, priorWeight, rng)]++;
  return wins.map((w) => w / draws);
}

export const MIN_IMPRESSIONS_PER_VARIANT = 200;
export const WINNER_THRESHOLD = 0.95;

export type LearningStatus = { state: "not-started" | "collecting" | "no-clear-winner" | "leader"; leaderId?: string; message: string };

/** Never names a winner on small samples: needs MIN_IMPRESSIONS on every arm and P(best) ≥ 95% from observed data alone. */
export function learningStatus(arms: Arm[], rng: Rng): LearningStatus {
  const total = arms.reduce((n, a) => n + a.impressions, 0);
  if (total === 0) return { state: "not-started", message: "No impressions yet." };
  const minImp = Math.min(...arms.map((a) => a.impressions));
  if (minImp < MIN_IMPRESSIONS_PER_VARIANT)
    return { state: "collecting", message: `Collecting data: each variant needs at least ${MIN_IMPRESSIONS_PER_VARIANT} impressions before any comparison (smallest has ${minImp}).` };
  // Judge on observed data only (flat prior), so the LLM's prediction can't declare a winner by itself.
  const observed = arms.map((a) => ({ ...a, predictedCtr: 0.5 }));
  const pBest = selectionProbabilities(observed, 2, rng, 4000);
  const top = pBest.indexOf(Math.max(...pBest));
  if (pBest[top] >= WINNER_THRESHOLD) return { state: "leader", leaderId: arms[top].id, message: `Variant ${top + 1} is likely best (${Math.round(pBest[top] * 100)}% probability from observed clicks).` };
  return { state: "no-clear-winner", message: `No clear winner yet: the leading variant has a ${Math.round(pBest[top] * 100)}% probability of being best (needs ${WINNER_THRESHOLD * 100}%).` };
}
