import { describe, expect, it } from "vitest";
import { seededRng } from "./bandit";
import {
  DEFAULT_UCB,
  clusterLeader,
  guardrailIssues,
  insightLine,
  metricFor,
  priorRate,
  simulateTitleLab,
  ucbPick,
  ucbScores,
  zeroCounts,
  type Counts,
  type UcbArm,
} from "./titleLab";

const c = (impressions: number, clicks: number, bookings = 0): Counts => ({ impressions, clicks, bookings });
const arm = (id: string, appeal: number, counts = zeroCounts()): UcbArm => ({ id, appeal, counts });

describe("UCB with priors", () => {
  it("follows the prior before any data", () => {
    const arms = [arm("a", 0.2), arm("b", 0.9), arm("c", 0.5)];
    expect(ucbPick(arms, DEFAULT_UCB, seededRng(1))).toBe(1);
  });

  it("treats the prior as pseudo-observations whose weight is configurable", () => {
    const arms = [arm("a", 0.9, c(100, 2)), arm("b", 0.1, c(100, 12))];
    const heavy = ucbScores(arms, { ...DEFAULT_UCB, priorWeight: 1000 }).scores;
    const light = ucbScores(arms, { ...DEFAULT_UCB, priorWeight: 1 }).scores;
    expect(heavy[0].mean).toBeGreaterThan(heavy[1].mean); // prior dominates
    expect(light[1].mean).toBeGreaterThan(light[0].mean); // data dominates
    expect(light[1].mean).toBeCloseTo((1 * priorRate(0.1, "clicks") + 12) / 101);
  });

  it("tries every arm first when there is no prior", () => {
    const cfg = { ...DEFAULT_UCB, priorWeight: 0 };
    const arms = [arm("a", 0.9, c(5, 1)), arm("b", 0.1)];
    expect(ucbPick(arms, cfg, seededRng(2))).toBe(1);
  });

  it("shrinks the exploration bonus as an arm collects impressions", () => {
    const [few, many] = ucbScores([arm("a", 0.5, c(10, 1)), arm("b", 0.5, c(1000, 100))]).scores;
    expect(few.bonus).toBeGreaterThan(many.bonus);
  });

  it("optimises clicks until the cluster has enough bookings, then bookings", () => {
    expect(metricFor([c(50, 5, 3), c(50, 4, 2)])).toBe("clicks");
    expect(metricFor([c(50, 5, 6), c(50, 4, 4)])).toBe("bookings");
    // Once on bookings, a variant with more bookings but fewer clicks wins.
    const arms = [arm("clicky", 0.5, c(2000, 200, 4)), arm("booky", 0.5, c(2000, 120, 30))];
    const { metric, scores } = ucbScores(arms);
    expect(metric).toBe("bookings");
    expect(scores[1].index).toBeGreaterThan(scores[0].index);
  });

  it("moves traffic to the better arm as evidence accumulates, even against a wrong prior", () => {
    const rng = seededRng(3);
    const truth = { a: 0.03, b: 0.1 };
    const arms = [arm("a", 0.9), arm("b", 0.1)];
    let late = 0;
    for (let i = 0; i < 4000; i++) {
      const k = ucbPick(arms, DEFAULT_UCB, rng);
      const a = arms[k];
      a.counts.impressions++;
      if (rng() < truth[a.id as "a" | "b"]) a.counts.clicks++;
      if (i >= 3000 && a.id === "b") late++;
    }
    expect(late / 1000).toBeGreaterThan(0.7);
  });
});

describe("guardrails", () => {
  const ctx = { factText: "acoustic sundowner · rooftop · acoustic · singer-songwriter · bengaluru · 6 pm", referenceNames: ["Prateek Kuhad"] };

  it("accepts fans-of phrasing", () => {
    expect(guardrailIssues({ title: "For fans of Prateek Kuhad", hook: "Acoustic sets on a rooftop" }, ctx)).toEqual([]);
  });

  it("rejects copy implying the referenced artist performs or is involved", () => {
    expect(guardrailIssues({ title: "Prateek Kuhad live on the rooftop", hook: "Acoustic sets" }, ctx).join(" ")).toMatch(/without “for fans of”|involved/);
    expect(guardrailIssues({ title: "For fans of Prateek Kuhad, featuring his songs", hook: "Acoustic" }, ctx).join(" ")).toMatch(/involved/);
    expect(guardrailIssues({ title: "If you liked Prateek Kuhad's album", hook: "Acoustic" }, ctx).join(" ")).toMatch(/Possessive/);
  });

  it("rejects false urgency, unsupported numbers, unknown names and long titles", () => {
    expect(guardrailIssues({ title: "Acoustic rooftop, selling fast", hook: "Acoustic" }, ctx).join(" ")).toMatch(/urgency/);
    expect(guardrailIssues({ title: "Acoustic rooftop at 9 pm", hook: "Acoustic" }, ctx).join(" ")).toMatch(/Number “9”/);
    expect(guardrailIssues({ title: "Acoustic with Arijit Singh", hook: "Acoustic" }, ctx).join(" ")).toMatch(/Arijit Singh/);
    expect(guardrailIssues({ title: "A".repeat(61), hook: "Acoustic" }, ctx).join(" ")).toMatch(/max 60/);
  });
});

describe("simulation", () => {
  const input = {
    variants: [
      { id: "fans", priors: { k: 0.8, t: 0.4 } },
      { id: "tag", priors: { k: 0.4, t: 0.8 } },
      { id: "control", priors: { k: 0.4, t: 0.4 } },
    ],
    clusters: [
      { id: "k", weight: 1 },
      { id: "t", weight: 1 },
    ],
    affinity: { k: { fans: 1, tag: 0.3, control: 0.3 }, t: { fans: 0.2, tag: 1, control: 0.3 } },
    seed: 11,
  };

  it("is reproducible and keeps bandit and equal split on the same visitors", () => {
    const a = simulateTitleLab(input);
    const b = simulateTitleLab(input);
    expect(a.bandit).toEqual(b.bandit);
    const shown = (r: typeof a.bandit) => Object.values(r.perVariant).reduce((n, v) => n + v.impressions, 0);
    expect(shown(a.bandit)).toBe(2000);
    expect(shown(a.equalSplit)).toBe(2000);
    expect(a.bestByCluster).toEqual({ k: "fans", t: "tag" });
  });

  it("learns a different winner per cluster and beats an equal split", () => {
    const r = simulateTitleLab(input);
    expect(r.series.at(-1)!.banditBest).toBeGreaterThan(0.6);
    expect(r.series.at(-1)!.abBest).toBeLessThan(0.45);
    expect(r.bandit.clicks).toBeGreaterThan(r.equalSplit.clicks);
  });
});

describe("leader and insight", () => {
  it("names no leader on small samples", () => {
    expect(clusterLeader([{ title: "A", counts: c(10, 3) }, { title: "B", counts: c(40, 1) }], "clicks")).toBeUndefined();
    expect(insightLine(0, [])).toMatch(/No card impressions/);
  });

  it("describes the leading cluster from the numbers only", () => {
    const leader = clusterLeader([{ title: "For fans of X", counts: c(100, 9) }, { title: "Control", counts: c(100, 3) }], "clicks");
    expect(leader).toEqual({ title: "For fans of X", rate: 0.09, average: 0.06 });
    const line = insightLine(260, [
      { label: "Fans of X", metric: "clicks", impressions: 200, leader },
      { label: "No matching interests", metric: "clicks", impressions: 60 },
    ]);
    expect(line).toBe("Fans of X click “For fans of X” most (9.0% vs 6.0% across that cluster's variants); 1 other cluster is still too early to call.");
  });
});
