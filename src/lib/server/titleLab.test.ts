import { describe, expect, it } from "vitest";
import { guardrailIssues } from "@/lib/titleLab";
import { getEvent } from "./catalog";
import { mappingsFor } from "./taste";
import { TitleLabError, changeTitleLab, clustersFor, createTitleLab, getTitleLab, planAnchors, recordTitleLab, runSimulation, titleLabPicks, titleLabReport } from "./titleLab";

describe("title lab", () => {
  it("anchors one variant per for-fans-of entity, one vibe tag, and a plain control", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    const anchors = planAnchors(mappingsFor(e));
    expect(anchors).toHaveLength(5);
    expect(anchors.map((a) => a.kind)).toEqual(["for-fans-of", "tag", "tag", "for-fans-of", "control"]);
    expect(anchors[3].angle).toBe("alternate");
    expect(clustersFor(mappingsFor(e)).map((c) => c.label)).toEqual(["Fans of Prateek Kuhad", "Into “Acoustic”", "Into “Singersongwriter”", "No matching interests"]);
  });

  it("falls back to guardrail-clean templates and heuristic priors without an LLM", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    const lab = await createTitleLab(e, e.organizerId, { force: true });
    expect(lab.variants).toHaveLength(5);
    for (const v of lab.variants) {
      expect(v.status).toBe("pending");
      expect(v.origin).toBe("template");
      expect(v.priorSource).toBe("heuristic");
      expect(Object.keys(v.priors).sort()).toEqual(lab.clusters.map((c) => c.id).sort());
      expect(guardrailIssues(v, { factText: JSON.stringify(e).toLowerCase(), referenceNames: ["Prateek Kuhad"] })).toEqual([]);
    }
    expect(lab.variants[0].title).toBe("For fans of Prateek Kuhad");
  });

  it("serves only approved variants, and logs impressions, clicks and bookings per cluster", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    await createTitleLab(e, e.organizerId, { force: true });
    expect((await titleLabPicks("u1", [], [e], () => `/events/${e.id}`)).size).toBe(0); // nothing approved yet
    await changeTitleLab(e.id, e.organizerId, { action: "approve-all" });
    const t5 = (await getTitleLab(e.id))!.variants[4].id;
    await changeTitleLab(e.id, e.organizerId, { action: "remove", variantId: t5 });

    const pick = (await titleLabPicks("u1", [], [e], () => `/events/${e.id}?session=s1`)).get(e.id)!;
    const q = new URL(pick.href, "http://x").searchParams;
    expect(q.get("c")).toBe("general"); // no interests → no-match cluster
    expect(q.get("v")).not.toBe(t5);
    expect(q.get("to")).toBe(`/events/${e.id}?session=s1`);
    await recordTitleLab("click", e.id, q.get("v")!, "general", "u1");
    await recordTitleLab("booking", e.id, q.get("v")!, "general");

    const lab = (await getTitleLab(e.id))!;
    expect(lab.stats.general[q.get("v")!]).toEqual({ impressions: 1, clicks: 1, bookings: 1 });
    expect(lab.log.map((l) => l.kind).sort()).toEqual(["booking", "click", "impression"]);
    const report = titleLabReport(lab);
    expect(report.rows).toHaveLength(4);
    expect(report.totalImpressions).toBe(1);
    expect(await recordTitleLab("click", e.id, "nope", "general")).toBe(false);
  });

  it("rejects organizer edits that break the guardrails", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    const t1 = (await createTitleLab(e, e.organizerId, { force: true })).variants[0].id;
    await expect(changeTitleLab(e.id, e.organizerId, { action: "edit", variantId: t1, title: "Prateek Kuhad live, selling fast", hook: "Acoustic sets" })).rejects.toBeInstanceOf(TitleLabError);
    const ok = await changeTitleLab(e.id, e.organizerId, { action: "edit", variantId: t1, title: "If you liked Prateek Kuhad", hook: e.summary.slice(0, 100) });
    expect(ok.variants[0]).toMatchObject({ title: "If you liked Prateek Kuhad", origin: "edited", status: "pending" });
  });

  it("keeps the simulated audience out of real metrics", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    await createTitleLab(e, e.organizerId, { force: true });
    const lab = await runSimulation(e.id, e.organizerId, 400);
    expect(lab.simulation!.affinitySource).toBe("fallback"); // no Qloo key in tests
    expect(Object.values(lab.simulation!.bandit.perVariant).reduce((n, c) => n + c.impressions, 0)).toBe(400);
    // Simulated rows exist, but only in the simulated aggregate.
    const simImpressions = Object.values(lab.simStats).flatMap((byV) => Object.values(byV)).reduce((n, c) => n + c.impressions, 0);
    expect(simImpressions).toBe(400);
    expect(titleLabReport(lab).totalImpressions).toBe(0);
    expect(lab.log).toEqual([]);
  });
});
