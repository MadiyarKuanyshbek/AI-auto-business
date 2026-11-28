import { describe, expect, it } from "vitest";
import { fitApk, fitCoding, fitFirmware } from "../src/core/fit";
import { DEMO_CODING_DSG } from "../src/core/sim/demoCoding";
import { DEMO_PACKAGE_V1 } from "../src/core/sim/demoPackage";

describe("проверка «подойдёт ли файл»", () => {
  it("приложение: процессор магнитолы против библиотек приложения", () => {
    expect(fitApk([], "arm64-v8a").level).toBe("ok");
    expect(fitApk(["arm64-v8a"], "arm64-v8a").level).toBe("ok");
    expect(fitApk(["armeabi-v7a"], "arm64-v8a").level).toBe("ok"); // 64-бит запускает 32-бит
    expect(fitApk(["arm64-v8a"], "armeabi-v7a").level).toBe("bad"); // наоборот нельзя
    expect(fitApk(["x86"], "arm64-v8a").level).toBe("bad");
    expect(fitApk(["arm64-v8a"], undefined).level).toBe("unknown");
  });
  it("пакет прошивки: список машин в пакете", () => {
    expect(fitFirmware(DEMO_PACKAGE_V1, { make: "Volkswagen", model: "Golf Mk6", year: 2010 }).level).toBe("ok");
    expect(fitFirmware(DEMO_PACKAGE_V1, { make: "Volkswagen", model: "Golf Mk8", year: 2021 }).level).toBe("bad");
    expect(fitFirmware(DEMO_PACKAGE_V1, { make: "Chery", model: "Tiggo 8", year: 2021 }).level).toBe("bad");
    expect(fitFirmware(DEMO_PACKAGE_V1, null).level).toBe("unknown");
  });
  it("пакет кодирования: по блокам подключённой машины и по списку машин", () => {
    const ecu = (txId: string, sp: string) => ({ name: "Коробка", txId, rxId: "7E9", ident: { sparePartNumber: sp }, refused: 0, obd: false }) as never;
    expect(fitCoding(DEMO_CODING_DSG, [ecu("7E1", "02E300057Q")], null).level).toBe("ok");
    expect(fitCoding(DEMO_CODING_DSG, [ecu("7E1", "OTHER")], null).level).toBe("bad");
    expect(fitCoding(DEMO_CODING_DSG, [ecu("7E0", "02E300057Q")], null).level).toBe("bad");
    expect(fitCoding(DEMO_CODING_DSG, null, { make: "Volkswagen", year: 2010 }).level).toBe("warn");
    expect(fitCoding(DEMO_CODING_DSG, null, null).level).toBe("unknown");
  });
});
