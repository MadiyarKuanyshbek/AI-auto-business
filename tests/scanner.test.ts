import { describe, expect, it } from "vitest";
import { Elm327, parseResponseLines } from "../src/core/elm327";
import { scanVehicle } from "../src/core/scanner";
import { SimulatedAdapter } from "../src/core/sim/simulator";
import { DEMO_VEHICLES } from "../src/core/sim/vehicles";
import { readPid, readDtcs, clearDtcs } from "../src/core/obd";
import { decodeVinOffline } from "../src/core/vin";

describe("ISO-TP parser", () => {
  it("assembles a multi-frame response with headers", () => {
    const msgs = parseResponseLines([
      "7E8 10 14 49 02 01 57 56 57",
      "7E8 21 5A 5A 5A 31 4B 5A 42",
      "7E8 22 57 31 32 33 34 35 36",
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].ecu).toBe("7E8");
    expect(msgs[0].data).toHaveLength(0x14);
    expect(msgs[0].data.slice(0, 3)).toEqual([0x49, 0x02, 0x01]);
  });
  it("parses headerless numbered multi-line format", () => {
    const msgs = parseResponseLines(["014", "0: 49 02 01 57 56 57", "1: 5A 5A 5A 31 4B 5A 42", "2: 57 31 32 33 34 35 36"]);
    expect(msgs[0].data).toHaveLength(0x14);
  });
  it("single frame", () => {
    expect(parseResponseLines(["7E8 03 41 0C 1A 00 00 00 00"])[0].data).toEqual([0x41, 0x0c, 0x1a]);
  });
});

describe("VIN", () => {
  it("decodes make and year", () => {
    const v = decodeVinOffline("WVWZZZ1KZBW123456");
    expect(v.make).toBe("Volkswagen");
    expect(v.modelYear).toBe(2011);
    expect(v.valid).toBe(true);
  });
  it("validates North American check digit", () => {
    expect(decodeVinOffline("1HGCM82633A004352").valid).toBe(true); // известный корректный VIN
    expect(decodeVinOffline("1HGCM82633A004353").valid).toBe(false);
  });
  it("rejects bad letters", () => {
    expect(decodeVinOffline("WVWZZZ1KZBW12345O").valid).toBe(false);
  });
});

describe.each(DEMO_VEHICLES.map((v) => [v.label, v] as const))("scan %s", (_label, vehicle) => {
  it("identifies the vehicle and its ECUs", async () => {
    const elm = new Elm327(new SimulatedAdapter(structuredClone(vehicle)));
    await elm.open();
    const scan = await scanVehicle(elm, { online: false });
    expect(scan.vin).toBe(vehicle.vin);
    expect(scan.mode09.calibrationIds[0]).toBe(vehicle.calibrationIds[0]);
    expect(scan.mode09.cvn).toEqual(vehicle.cvn);
    // Блоки вне 7E0–7E7 находит только глубокий поиск.
    expect(scan.ecus.length).toBe((vehicle.bus ?? "can11") === "can11" ? vehicle.ecus.filter((e) => /^7E[0-7]$/.test(e.txId)).length : vehicle.ecus.length);
    expect(scan.ecus[0].ident.vin).toBe(vehicle.vin);
    expect(scan.dtcs.map((d) => d.code).sort()).toEqual([...(vehicle.ecus[0].dtcs ?? [])].sort());
    expect(scan.adapter.voltage).toBeCloseTo(vehicle.voltage, 1);
  });
});

describe("live data and DTC", () => {
  it("reads RPM and coolant", async () => {
    const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[0])));
    await elm.open();
    await elm.init();
    expect((await readPid(elm, 0x0c)).value).toBe(800);
    expect((await readPid(elm, 0x05)).value).toBe(55);
  });
  it("clears DTCs", async () => {
    const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[0])));
    await elm.open();
    await elm.init();
    expect((await readDtcs(elm, "stored")).map((d) => d.code)).toEqual(["P0299"]);
    await clearDtcs(elm);
    expect(await readDtcs(elm, "stored")).toEqual([]);
  });
  it("times out cleanly when the adapter goes silent", async () => {
    const sim = new SimulatedAdapter(structuredClone(DEMO_VEHICLES[0]));
    const elm = new Elm327(sim);
    await elm.open();
    await elm.init();
    sim.mute.add("010C");
    await expect(elm.raw("010C", 200)).rejects.toThrow(/Таймаут/);
    // после таймаута очередь не заблокирована
    expect((await readPid(elm, 0x05)).value).toBe(55);
  });
});

import { resolveModelYear, decodeVinOffline as dv } from "../src/core/vin";
describe("model year resolution", () => {
  it("prefers offline year for non-NA VIN and NHTSA for NA", () => {
    const eu = dv("WVWZZZ1KZBW123456");
    expect(resolveModelYear(eu, { modelYear: 1981 })).toBe(2011);
    const na = dv("1HGCM82633A004352");
    expect(resolveModelYear(na, { modelYear: 2003 })).toBe(2003);
  });
});

import { buildReportHtml, buildReportText } from "../src/core/report";
describe("report", () => {
  it("builds text and HTML and escapes markup", async () => {
    const v = structuredClone(DEMO_VEHICLES[0]);
    v.ecus[0].dids![0xf197] = "<script>alert(1)</script>";
    const elm = new Elm327(new SimulatedAdapter(v));
    await elm.open();
    const scan = await scanVehicle(elm, { online: false });
    expect(buildReportText(scan)).toContain("WVWZZZ1KZBW123456");
    const html = buildReportHtml(scan);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("P0299");
  });
});

import { parseKLineLines, busKindFromProtocolId } from "../src/core/elm327";
describe("K-Line and 29-bit", () => {
  it("parses ISO 9141 and KWP frames and drops the checksum", () => {
    expect(parseKLineLines(["48 6B 11 41 0C 1A F8 BA"])[0].data).toEqual([0x41, 0x0c, 0x1a, 0xf8]);
    expect(parseKLineLines(["83 F1 10 5A 94 41 42 00"])[0].data).toEqual([0x5a, 0x94, 0x41]);
  });
  it("maps protocol ids to bus kinds", () => {
    expect(busKindFromProtocolId("A6")).toBe("can11");
    expect(busKindFromProtocolId("A7")).toBe("can29");
    expect(busKindFromProtocolId("A5")).toBe("kline");
    expect(busKindFromProtocolId("A3")).toBe("kline");
  });
  for (const i of [3, 4, 5]) {
    it(`scans demo vehicle #${i}`, async () => {
      const v = DEMO_VEHICLES[i];
      const elm = new Elm327(new SimulatedAdapter(structuredClone(v)));
      await elm.open();
      const scan = await scanVehicle(elm, { online: false });
      expect(scan.adapter.bus).toBe(v.bus);
      expect(scan.vin).toBe(v.vin);
      expect(scan.mode09.calibrationIds[0]).toBe(v.calibrationIds[0]);
      expect(scan.ecus.length).toBeGreaterThanOrEqual(1);
      expect(scan.dtcs.map((d) => d.code).sort()).toEqual([...(v.ecus[0].dtcs ?? [])].sort());
      expect(scan.supportedPids.length).toBeGreaterThan(5);
    });
  }
  it("reads KWP identification of the Skoda engine ECU", async () => {
    const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[3])));
    await elm.open();
    const scan = await scanVehicle(elm, { online: false });
    const engine = scan.ecus[0];
    expect(engine.ident.supplierSoftwareNumber).toBe("1037372851");
    expect(engine.ident.hardwareNumber).toBe("038906019BQ");
  });
});

import { describeDtc, dtcCount } from "../src/core/dtc";
describe("DTC reference", () => {
  it("has specific and fallback descriptions", () => {
    expect(describeDtc("P0299")).toMatch(/наддув/i);
    expect(describeDtc("P0305")).toMatch(/цилиндре 5/);
    expect(describeDtc("P020C")).toMatch(/цилиндра 12/);
    expect(describeDtc("P0999")).toMatch(/Коробка передач/);
    expect(describeDtc("P1234")).toMatch(/производителя/);
    expect(describeDtc("U0100")).toMatch(/ECM/);
    expect(dtcCount()).toBeGreaterThan(200);
  });
});


import { deepScan } from "../src/core/scanner";
describe("deep scan and friendly names", () => {
  it("finds blocks outside the standard addresses and names them", async () => {
    const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[0])));
    await elm.open();
    const scan = await scanVehicle(elm, { online: false });
    expect(scan.ecus.some((e) => e.txId === "7E4" && e.name.startsWith("Панель приборов"))).toBe(true);
    expect(scan.ecus.some((e) => e.txId === "7A0")).toBe(false);
    const extra = await deepScan(elm, scan.ecus);
    expect(extra.map((e) => e.txId)).toEqual(["7A0"]);
    expect(extra[0].name).toMatch(/Шлюз/);
    expect(extra[0].ident.softwareVersion).toBe("0310");
    // повторный запуск с уже известными блоками ничего нового не находит
    expect(await deepScan(elm, [...scan.ecus, ...extra])).toEqual([]);
  });
  it("does nothing on non-CAN11 buses", async () => {
    const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[3])));
    await elm.open();
    await scanVehicle(elm, { online: false });
    expect(await deepScan(elm, [])).toEqual([]);
  });
});
