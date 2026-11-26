import { describe, expect, it } from "vitest";
import { installMethodFor } from "../src/core/installMethods";

describe("способы установки по маркам", () => {
  it("для китайских марок есть описание, для неизвестной — общее", () => {
    expect(installMethodFor("BYD").headline).toContain("BYD");
    expect(installMethodFor("Chery").steps.length).toBeGreaterThan(0);
    expect(installMethodFor("Неизвестная").headline).toContain("магнитолы");
  });
});

describe("GAC", () => {
  it("есть в справочнике и со способом обновления", async () => {
    const { searchCars } = await import("../src/core/cars");
    expect(searchCars("gac empow").some((c) => c.make === "GAC" && c.model.includes("Empow"))).toBe(true);
    expect(installMethodFor("GAC").headline).toContain("GAC");
  });
});
