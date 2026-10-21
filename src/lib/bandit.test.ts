import { describe, expect, it } from "vitest";
import { MIN_IMPRESSIONS_PER_VARIANT, learningStatus, seededRng, selectionProbabilities, thompsonPick, type Arm } from "./bandit";
import { combineConstraints } from "./group";

describe("LOLA-inspired allocation", () => {
  it("selection probabilities form a distribution and follow the prior before data", () => {
    const arms: Arm[] = [
      { id: "a", predictedCtr: 0.08, impressions: 0, clicks: 0 },
      { id: "b", predictedCtr: 0.02, impressions: 0, clicks: 0 },
    ];
    const p = selectionProbabilities(arms, 20, seededRng(1), 3000);
    expect(p[0] + p[1]).toBeCloseTo(1, 5);
    expect(p[0]).toBeGreaterThan(p[1]);
  });

  it("observed clicks override a wrong prediction", () => {
    const rng = seededRng(3);
    const truth = [0.02, 0.1]; // model thinks arm 0 is better; it isn't
    const arms: Arm[] = [
      { id: "a", predictedCtr: 0.08, impressions: 0, clicks: 0 },
      { id: "b", predictedCtr: 0.02, impressions: 0, clicks: 0 },
    ];
    for (let i = 0; i < 3000; i++) {
      const k = thompsonPick(arms, 20, rng);
      arms[k].impressions++;
      if (rng() < truth[k]) arms[k].clicks++;
    }
    expect(arms[1].impressions).toBeGreaterThan(arms[0].impressions);
  });

  it("does not declare a winner from small samples", () => {
    const arms: Arm[] = [
      { id: "a", predictedCtr: 0.04, impressions: 50, clicks: 10 },
      { id: "b", predictedCtr: 0.04, impressions: 50, clicks: 0 },
    ];
    expect(learningStatus(arms, seededRng(5)).state).toBe("collecting");
    const big = arms.map((a, i) => ({ ...a, impressions: MIN_IMPRESSIONS_PER_VARIANT * 2, clicks: i === 0 ? 40 : 8 }));
    expect(learningStatus(big, seededRng(5))).toMatchObject({ state: "leader", leaderId: "a" });
  });
});

describe("group constraints", () => {
  it("uses the lowest budget and the overlap of dates, flagging conflicts", () => {
    expect(combineConstraints([{ budgetMax: 1500, from: "2026-10-24", to: "2026-11-02" }, { budgetMax: 900, from: "2026-10-28" }, {}])).toMatchObject({ budgetMax: 900, from: "2026-10-28", to: "2026-11-02", conflict: false, people: 3 });
    expect(combineConstraints([{ from: "2026-11-10", to: "2026-11-12" }, { from: "2026-11-01", to: "2026-11-05" }]).conflict).toBe(true);
  });
});
