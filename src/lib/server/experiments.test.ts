import { describe, expect, it } from "vitest";
import { getEvent } from "./catalog";
import { interactionLog } from "./analytics";
import { createExperiment, experimentReport, getExperiment, pickPromo, recordClick, setStatus, simulate, validCopy } from "./experiments";

describe("promotional experiments", () => {
  it("rejects invented scarcity, discounts and unknown names", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    expect(validCopy({ headline: "Quiet songs at sunset", body: "Two acoustic sets in Indiranagar." }, e)).toBe(true);
    expect(validCopy({ headline: "Selling fast!", body: "Two acoustic sets." }, e)).toBe(false);
    expect(validCopy({ headline: "20% off tonight", body: "Two acoustic sets." }, e)).toBe(false);
    expect(validCopy({ headline: "Featuring Taylor Swift", body: "Two acoustic sets." }, e)).toBe(false);
  });

  it("drafts a fixed set of grounded variants without an LLM, and logs impressions with selection probability", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    const x = await createExperiment(e.organizerId, e, { id: "city:bengaluru-in", kind: "city", label: "Everyone", cityId: "bengaluru-in" });
    expect(x.copySource).toBe("template");
    expect(x.variants).toHaveLength(4);
    for (const v of x.variants) expect(validCopy(v, e)).toBe(true);
    await setStatus(x.id, e.organizerId, "running");
    const pick = await pickPromo("viewer-1", "bengaluru-in", []);
    expect(pick?.experimentId).toBe(x.id);
    expect(pick!.probability).toBeGreaterThan(0);
    await recordClick("viewer-1", x.id, pick!.variantId);
    const log = await interactionLog(e.id);
    expect(log.find((l) => l.kind === "impression")).toMatchObject({ experimentId: x.id, variantId: pick!.variantId, audienceId: "city:bengaluru-in", source: "real" });
    expect(log.find((l) => l.kind === "click")?.variantId).toBe(pick!.variantId);
  });

  it("keeps simulated interactions separate from real ones", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    const x = (await createExperiment(e.organizerId, e, { id: "city:bengaluru-in", kind: "city", label: "Everyone", cityId: "bengaluru-in" }));
    await simulate(x.id, e.organizerId, 500);
    const after = (await getExperiment(x.id))!;
    expect(experimentReport(after, "simulated").totalImpressions).toBe(500);
    expect(experimentReport(after, "real").totalImpressions).toBe(0);
    expect(experimentReport(after, "real").status.state).toBe("not-started");
  });
});
