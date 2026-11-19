import { describe, expect, it } from "vitest";
import { ALL_CARS, ALL_MAKES, carsOfMake, matchScannedCar, searchCars } from "../src/core/cars";

describe("car database", () => {
  it("covers many makes and models", () => {
    expect(ALL_MAKES.length).toBeGreaterThan(55);
    expect(ALL_CARS.length).toBeGreaterThan(550);
    expect(new Set(ALL_CARS.map((c) => c.id)).size).toBe(ALL_CARS.length);
    expect(carsOfMake("Toyota").length).toBeGreaterThan(25);
  });
  it("finds cars by English and Russian names", () => {
    expect(searchCars("camry").every((c) => c.make === "Toyota")).toBe(true);
    expect(searchCars("камри 2019")[0].model).toMatch(/Camry XV70/);
    expect(searchCars("тойота прадо")[0].model).toMatch(/Prado/);
    expect(searchCars("бмв x5").some((c) => c.make === "BMW" && /X5/.test(c.model))).toBe(true);
    expect(searchCars("мерседес е класс 2018").some((c) => /E-Class W213/.test(c.model))).toBe(true);
    expect(searchCars("g30").some((c) => /G30/.test(c.model))).toBe(true);
  });
  it("respects the year filter and returns nothing for gibberish", () => {
    expect(searchCars("golf 2008").every((c) => c.from <= 2008)).toBe(true);
    expect(searchCars("zzzzqq")).toEqual([]);
    expect(searchCars("")).toEqual([]);
  });
  it("matches a scanned vehicle to database entries", () => {
    const m = matchScannedCar("VOLKSWAGEN", undefined, 2011);
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((c) => c.make === "Volkswagen" && c.from <= 2011)).toBe(true);
  });
});
