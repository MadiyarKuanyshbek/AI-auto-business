import { describe, expect, it } from "vitest";
import { installMethodFor } from "../src/core/installMethods";

describe("способы установки по маркам", () => {
  it("для китайских марок есть описание, для неизвестной — общее", () => {
    expect(installMethodFor("BYD").headline).toContain("BYD");
    expect(installMethodFor("Chery").steps.length).toBeGreaterThan(0);
    expect(installMethodFor("Неизвестная").headline).toContain("магнитолы");
  });
});
