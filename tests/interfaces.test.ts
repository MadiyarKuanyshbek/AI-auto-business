import { describe, expect, it } from "vitest";
import { ALL_CARS, searchCars } from "../src/core/cars";
import { THEMES, baseModel, generationLabel, interfaceFileName, interfaceFilesFor, profileFor, describeProfile, themeFits, type TrimLevel } from "../src/core/interfaces";

const find = (re: RegExp) => ALL_CARS.find((c) => re.test(`${c.make} ${c.model}`))!;

describe("display profiles", () => {
  it("gives premium cars digital clusters earlier than mainstream ones", () => {
    const bmw = find(/BMW 5 Series G30/);
    expect(profileFor(bmw, "top").cluster).toBe("digital");
    const old = find(/Toyota Camry XV50/);
    expect(profileFor(old, "base").cluster).toBe("analog");
    expect(profileFor(find(/Toyota Camry XV70/), "top").cluster).toBe("digital");
    expect(profileFor(find(/Toyota Camry XV70/), "base").cluster).not.toBe("digital");
  });
  it("trim level only ever adds screens", () => {
    const order = { none: 0, small: 1, large: 2 } as const;
    const clusterOrder = { none: 0, analog: 0, hybrid: 1, digital: 2 } as const;
    for (const car of ALL_CARS) {
      const b = profileFor(car, "base");
      const m = profileFor(car, "mid");
      const t = profileFor(car, "top");
      expect(clusterOrder[m.cluster]).toBeGreaterThanOrEqual(clusterOrder[b.cluster]);
      expect(clusterOrder[t.cluster]).toBeGreaterThanOrEqual(clusterOrder[m.cluster]);
      expect(order[t.center]).toBeGreaterThanOrEqual(order[b.center]);
    }
  });
  it("Tesla has only a big center screen", () => {
    const p = profileFor(find(/Tesla Model 3/), "base");
    expect(p).toMatchObject({ cluster: "none", center: "large" });
    expect(describeProfile(p).join(" ")).toMatch(/Приборной панели нет/);
  });
});

describe("interface files", () => {
  it("lists every theme for every car and marks which ones fit", () => {
    for (const car of ALL_CARS) {
      const files = interfaceFilesFor(car, "top");
      expect(files).toHaveLength(THEMES.length);
      expect(files.every((f) => f.fileName.startsWith("AF-UI-") && f.fileName.endsWith(".afpkg"))).toBe(true);
      expect(files.every((f) => f.status === "mockup")).toBe(true);
    }
    expect(interfaceFilesFor(find(/Lada Granta/), "base").filter((f) => f.theme.target === "cluster" && f.fits)).toEqual([]);
  });
  it("only offers HUD and ambient themes when the trim has them", () => {
    for (const trim of ["base", "mid", "top"] as TrimLevel[]) {
      const car = find(/Mercedes-Benz E-Class W213/);
      const files = interfaceFilesFor(car, trim);
      const p = profileFor(car, trim);
      expect(files.find((f) => f.theme.id === "hud")!.fits).toBe(p.hud);
      expect(files.find((f) => f.theme.id === "ambient")!.fits).toBe(p.ambient);
    }
  });
  it("marks a ready package", () => {
    const car = find(/Volkswagen Golf Mk6/);
    expect(interfaceFilesFor(car, "top", { classic: "golf-cluster-classic" }).find((f) => f.theme.id === "classic")).toMatchObject({ status: "ready", packageId: "golf-cluster-classic", fits: true });
  });
  it("themeFits explains why a theme does not fit", () => {
    const sport = THEMES.find((t) => t.id === "sport")!;
    expect(themeFits(sport, profileFor(find(/Lada Granta/), "base")).reason).toMatch(/Аналоговая/);
  });
});

describe("grouping helpers", () => {
  it("splits model and generation", () => {
    expect(baseModel("Camry XV70")).toBe("Camry");
    expect(generationLabel(find(/Camry XV70/))).toBe("XV70");
    expect(baseModel("Land Cruiser 200")).toBe("Land Cruiser");
    expect(baseModel("Model 3")).toBe("Model 3");
    expect(interfaceFileName(find(/Camry XV70/), "sport")).toBe("AF-UI-Toyota-Camry-XV70-sport.afpkg");
    expect(searchCars("camry").length).toBeGreaterThan(1);
  });
});
