import { describe, expect, it } from "vitest";
import { Elm327 } from "../src/core/elm327";
import { installChecks, installPackage, readBackup, restoreBackup, type InstallRequest } from "../src/core/install";
import { compareVersions, parsePackage } from "../src/core/package";
import { scanVehicle } from "../src/core/scanner";
import { DEMO_PACKAGE_V1, DEMO_PACKAGE_V1_1 } from "../src/core/sim/demoPackage";
import { SimulatedAdapter } from "../src/core/sim/simulator";
import { DEMO_VEHICLES } from "../src/core/sim/vehicles";
import { sha256Hex } from "../src/core/sha256";

async function setup(over: (v: (typeof DEMO_VEHICLES)[number]) => void = () => undefined) {
  const vehicle = structuredClone(DEMO_VEHICLES[0]);
  over(vehicle);
  const sim = new SimulatedAdapter(vehicle);
  const elm = new Elm327(sim);
  await elm.open();
  const scan = await scanVehicle(elm, { online: false });
  return { vehicle, elm, scan, ecu: scan.ecus[0] };
}

async function request(pkg = DEMO_PACKAGE_V1, over: Partial<InstallRequest> = {}, vehicleOver?: Parameters<typeof setup>[0]): Promise<InstallRequest> {
  const { elm, scan, ecu } = await setup(vehicleOver);
  const parsed = parsePackage(pkg);
  if (!parsed.ok) throw new Error(parsed.error);
  // На обычном ELM327 прочитать память нельзя (запрос длиннее кадра) — копии нет, и это ожидаемо.
  const backup = await readBackup(elm, ecu, pkg).catch(() => null);
  return {
    elm, scan, ecu, pkg, segments: parsed.segments, transportKind: "demo", voltage: 13.8, backup,
    ack: { customerConsent: true, legalNotice: true, offRoad: false, wirelessRisk: true }, ...over,
  };
}

describe("package format", () => {
  it("accepts a valid package and rejects tampering", () => {
    expect(parsePackage(DEMO_PACKAGE_V1).ok).toBe(true);
    const tampered = structuredClone(DEMO_PACKAGE_V1);
    tampered.segments[0].dataBase64 = "AAAA" + tampered.segments[0].dataBase64.slice(4);
    const r = parsePackage(tampered);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/контрольная сумма/);
    expect(parsePackage({ format: "x" }).ok).toBe(false);
    expect(parsePackage(null).ok).toBe(false);
  });
  it("rejects overlapping segments", () => {
    const p = structuredClone(DEMO_PACKAGE_V1);
    p.segments.push({ ...p.segments[0] });
    expect(parsePackage(p).ok).toBe(false);
  });
  it("compares versions numerically", () => {
    expect(compareVersions("1.10.0", "1.2.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBeLessThan(0);
  });
});

describe("adapter capabilities", () => {
  it("detects an STN chip and a plain ELM327", async () => {
    expect((await setup()).scan.adapter.isStn).toBe(true);
    const plain = await setup((v) => {
      v.stn = false;
    });
    expect(plain.scan.adapter.isStn).toBe(false);
    await expect(plain.elm.requestLong("2EF190" + "00".repeat(10))).rejects.toThrow(/STN/);
  });
});

describe("installing a package over the adapter", () => {
  it("backs up, installs, restarts the ECU and verifies the new software number", async () => {
    const req = await request();
    const original = new Uint8Array(req.backup!);
    expect(installChecks(req).filter((c) => c.blocking && !c.ok)).toEqual([]);
    const progress: number[] = [];
    const out = await installPackage(req, (_s, f) => progress.push(f));
    expect(out.status).toBe("success");
    expect(out.status === "success" && out.newSoftware).toBe(DEMO_PACKAGE_V1.expectedSoftwareNumber);
    expect(progress.at(-1)).toBe(1);
    // Содержимое блока теперь равно пакету, а резервная копия — старому содержимому.
    const after = await readBackup(req.elm, req.ecu, req.pkg);
    expect(sha256Hex(after)).toBe(DEMO_PACKAGE_V1.segments[0].sha256);
    expect(sha256Hex(original)).not.toBe(sha256Hex(after));
  });

  it("updates an already installed package to a newer version", async () => {
    const first = await request(DEMO_PACKAGE_V1);
    expect((await installPackage(first)).status).toBe("success");
    // Пересканируем: у блока уже новый номер ПО, пакет 1.1.0 применим и к нему.
    const scan = await scanVehicle(first.elm, { online: false });
    const parsed = parsePackage(DEMO_PACKAGE_V1_1);
    if (!parsed.ok) throw new Error(parsed.error);
    const ecu = scan.ecus[0];
    expect(ecu.ident.supplierSoftwareNumber).toBe(DEMO_PACKAGE_V1.expectedSoftwareNumber);
    const backup = await readBackup(first.elm, ecu, DEMO_PACKAGE_V1_1);
    const out = await installPackage({ ...first, scan, ecu, pkg: DEMO_PACKAGE_V1_1, segments: parsed.segments, backup });
    expect(out.status === "failed" ? out.error : "ok").toBe("ok");
    expect(out.status === "success" && out.newSoftware).toBe(DEMO_PACKAGE_V1_1.expectedSoftwareNumber);
  });

  it("refuses without STN, for a wrong ECU, low voltage, no backup, no consent, or a demo package on a real adapter", async () => {
    const cases: [Partial<InstallRequest>, Parameters<typeof setup>[0] | undefined, RegExp][] = [
      [{}, (v) => { v.stn = false; }, /Адаптер не подходит/],
      [{ voltage: 11.9 }, undefined, /Напряжение/],
      [{ backup: null }, undefined, /резервной копии/],
      [{ ack: { customerConsent: false, legalNotice: true, offRoad: false, wirelessRisk: true } }, undefined, /Согласие/],
      [{ transportKind: "ble" as const, ack: { customerConsent: true, legalNotice: true, offRoad: false, wirelessRisk: false } }, undefined, /беспроводной связи|демонстрационный/],
      [{ transportKind: "ble" as const }, undefined, /демонстрационный/],
    ];
    for (const [over, veh, re] of cases) {
      const req = await request(DEMO_PACKAGE_V1, over, veh);
      const out = await installPackage(req);
      expect(out.status).toBe("failed");
      expect(out.status === "failed" && out.error).toMatch(re);
    }
  });

  it("blocks a package whose software number does not match", async () => {
    const pkg = structuredClone(DEMO_PACKAGE_V1);
    pkg.target.softwareNumbers = ["9999999999"];
    const req = await request(pkg);
    const out = await installPackage(req);
    expect(out.status === "failed" && out.error).toMatch(/номер ПО не совпал/);
  });

  it("fails cleanly on a wrong security key and leaves memory untouched", async () => {
    const pkg = structuredClone(DEMO_PACKAGE_V1);
    const req = await request(DEMO_PACKAGE_V1);
    const before = sha256Hex(await readBackup(req.elm, req.ecu, DEMO_PACKAGE_V1));
    pkg.procedure.security = { level: 0x11, algorithm: "demo-xor-add", params: { maskHex: "11" } };
    const out = await installPackage({ ...req, pkg });
    expect(out.status === "failed" && out.error).toMatch(/Неверный ключ|Отправка ключа/);
    expect(sha256Hex(await readBackup(req.elm, req.ecu, DEMO_PACKAGE_V1))).toBe(before);
  });

  it("restores the original from the backup", async () => {
    const req = await request();
    const original = sha256Hex(req.backup!);
    expect((await installPackage(req)).status).toBe("success");
    const r = await restoreBackup(req);
    expect(r.ok).toBe(true);
    expect(sha256Hex(await readBackup(req.elm, req.ecu, req.pkg))).toBe(original);
  });
});

describe("демо-установка для других виртуальных машин", () => {
  it("ставит пакеты в блок двигателя BMW и Camry и блок сообщает новый номер ПО", async () => {
    const { DEMO_PACKAGE_BMW, DEMO_PACKAGE_CAMRY } = await import("../src/core/sim/demoPackage");
    for (const [index, pkg] of [[1, DEMO_PACKAGE_BMW], [2, DEMO_PACKAGE_CAMRY]] as const) {
      const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[index])));
      await elm.open();
      const scan = await scanVehicle(elm, { online: false });
      const ecu = scan.ecus[0];
      const parsed = parsePackage(pkg);
      if (!parsed.ok) throw new Error(parsed.error);
      const backup = await readBackup(elm, ecu, pkg).catch(() => null);
      const req: InstallRequest = { elm, scan, ecu, pkg, segments: parsed.segments, transportKind: "demo", voltage: 13.8, backup, ack: { customerConsent: true, legalNotice: true, offRoad: false, wirelessRisk: true } };
      expect(installChecks(req).every((c) => c.ok || !c.blocking)).toBe(true);
      const result = await installPackage(req, () => undefined);
      expect(result.status).toBe("success");
      expect(result.status === "success" && result.newSoftware).toBe(pkg.expectedSoftwareNumber);
    }
  });
});

describe("кодирование блока (UDS 0x2E)", () => {
  async function dsg() {
    const { DEMO_CODING_DSG } = await import("../src/core/sim/demoCoding");
    const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[0])));
    await elm.open();
    const scan = await scanVehicle(elm, { online: false });
    const ecu = scan.ecus.find((e) => e.txId === "7E1")!;
    return { elm, ecu, pkg: DEMO_CODING_DSG };
  }
  it("проверяет описание пакета и отвергает неверные", async () => {
    const { parseCodingPackage } = await import("../src/core/coding");
    const { DEMO_CODING_DSG } = await import("../src/core/sim/demoCoding");
    expect(parseCodingPackage(DEMO_CODING_DSG).ok).toBe(true);
    const bad = structuredClone(DEMO_CODING_DSG);
    bad.options[0].changes[0].byte = 9;
    expect(parseCodingPackage(bad).ok).toBe(false);
    const bad2 = structuredClone(DEMO_CODING_DSG);
    bad2.options[0].changes[0].value = 0x04;
    expect(parseCodingPackage(bad2).ok).toBe(false);
    expect(parseCodingPackage({ format: "x" }).ok).toBe(false);
  });
  it("применяет настройки к значению и находит уже включённые", async () => {
    const { applyOptions, activeOptions, diffBytes } = await import("../src/core/coding");
    const { DEMO_CODING_DSG: pkg } = await import("../src/core/sim/demoCoding");
    const orig = [0x01, 0x00, 0x20, 0x00];
    const next = applyOptions(orig, pkg, ["sport-default", "hill-hold"]);
    expect(next).toEqual([0x03, 0x01, 0x20, 0x00]);
    expect(activeOptions(next, pkg).sort()).toEqual(["hill-hold", "sport-default"]);
    expect(diffBytes(orig, next).length).toBe(2);
  });
  it("читает, записывает, проверяет и возвращает настройки виртуальной коробки", async () => {
    const { readCoding, writeCoding, applyOptions, codingFitsEcu } = await import("../src/core/coding");
    const { elm, ecu, pkg } = await dsg();
    expect(codingFitsEcu(pkg, ecu)).toBe(true);
    const original = await readCoding(elm, ecu, pkg);
    expect(original).toEqual([0x01, 0x00, 0x20, 0x00]);
    const next = applyOptions(original, pkg, ["gear-hint"]);
    const res = await writeCoding(elm, ecu, pkg, original, next);
    expect(res.status).toBe("success");
    expect(await readCoding(elm, ecu, pkg)).toEqual(next);
    const back = await writeCoding(elm, ecu, pkg, next, original);
    expect(back.status).toBe("success");
    expect(await readCoding(elm, ecu, pkg)).toEqual(original);
  });
  it("без верного алгоритма доступа блок не пишется, настройки остаются прежними", async () => {
    const { readCoding, writeCoding } = await import("../src/core/coding");
    const { elm, ecu, pkg } = await dsg();
    const original = await readCoding(elm, ecu, pkg);
    const wrong = structuredClone(pkg);
    wrong.security = { level: 0x03, algorithm: "demo-xor-add", params: { maskHex: "99" } };
    const res = await writeCoding(elm, ecu, wrong, original, [0xff, 0xff, 0xff, 0xff]);
    expect(res.status).toBe("failed");
    expect(await readCoding(elm, ecu, pkg)).toEqual(original);
  });
  it("пакет не подходит другому блоку и неверной длине значения", async () => {
    const { codingFitsEcu, readCoding } = await import("../src/core/coding");
    const { elm, ecu, pkg } = await dsg();
    const engine = (await scanVehicle(elm, { online: false })).ecus.find((e) => e.txId === "7E0")!;
    expect(codingFitsEcu(pkg, engine)).toBe(false);
    const wrongLen = structuredClone(pkg);
    wrongLen.target.length = 6;
    await expect(readCoding(elm, ecu, wrongLen)).rejects.toThrow(/Длина/);
  });
});
