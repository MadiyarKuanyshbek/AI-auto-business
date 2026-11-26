import { describe, expect, it } from "vitest";
import { Elm327 } from "../src/core/elm327";
import { scanVehicle } from "../src/core/scanner";
import { SimulatedAdapter } from "../src/core/sim/simulator";
import { DEMO_VEHICLES } from "../src/core/sim/vehicles";
import { buildComparisonHtml, buildComparisonText, buildReceiptHtml, diffScans } from "../src/core/reportExtra";
import { sanitizeData, DEFAULT_SETTINGS } from "../src/storage/model";

async function scan(i: number) {
  const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[i])));
  await elm.open();
  return scanVehicle(elm, { online: false });
}

describe("before/after and receipt", () => {
  it("diffs two scans and renders escaped reports", async () => {
    const before = await scan(0);
    const after = structuredClone(before);
    after.dtcs = [];
    after.ecus[0].ident.supplierSoftwareNumber = "1037999999";
    const diff = diffScans(before, after);
    expect(diff.fixedDtcs).toEqual(["P0299"]);
    expect(diff.ecuChanges.some((c) => c.after === "1037999999")).toBe(true);
    const html = buildComparisonHtml(before, after, { workshop: "<b>Мастерская</b>" });
    expect(html).toContain("1037999999");
    expect(html).not.toContain("<b>Мастерская</b>");
    expect(buildComparisonText(before, after)).toContain("P0299");
  });

  it("renders a receipt with the balance due", () => {
    const html = buildReceiptHtml({
      workshop: "AF", workshopPhone: "", jobTitle: "Stage 1", jobNumber: "7", date: 0, customerName: "Иван",
      customerPhone: "", vehicle: "Golf", vin: "X", priceKzt: 90000, paidKzt: 40000, notes: "",
    });
    expect(html).toMatch(/50\s000/);
  });
});

describe("settings sanitising", () => {
  it("fills defaults for old or broken data", () => {
    expect(sanitizeData({}).settings).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeData({ settings: { showDemo: "yes" } }).settings.showDemo).toBe(true);
    expect(sanitizeData({ customers: [{ id: 1 }], jobs: [1], media: { x: [{ kind: "bad" }] } }).media.x).toEqual([]);
  });
});
