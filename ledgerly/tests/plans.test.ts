import { describe, expect, it } from "vitest";
import { PLAN_IDS, PLAN_PRICE_CENTS, amountsVisible, planLabel, planPriceCents } from "@/lib/plans";

describe("plan catalog", () => {
  it("exposes only the three demo prices", () => {
    expect(PLAN_PRICE_CENTS).toEqual({
      STARTER: 4900,
      GROWTH: 9900,
      SCALE: 24900,
    });
  });

  it("labels plans without mentioning a made-up tier", () => {
    expect(planLabel("STARTER")).toBe("Starter");
    expect(planPriceCents("GROWTH")).toBe(9900);
  });

  it("refuses unknown plans instead of inventing a price", () => {
    expect(() => planPriceCents("ENTERPRISE")).toThrow(/Unknown plan/);
  });

  it("shows amounts only for Starter, Growth, and Scale", () => {
    expect(PLAN_IDS).toEqual(["STARTER", "GROWTH", "SCALE"]);
    expect(amountsVisible("STARTER")).toBe(true);
    expect(amountsVisible("GROWTH")).toBe(true);
    expect(amountsVisible("SCALE")).toBe(true);
    expect(amountsVisible("PILOT")).toBe(false);
    expect(amountsVisible("FREE")).toBe(false);
    expect(amountsVisible("TRIAL")).toBe(false);
    expect(amountsVisible("ENTERPRISE")).toBe(false);
  });
});
