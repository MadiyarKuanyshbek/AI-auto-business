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
    expect(scan.ecus.length).toBe(vehicle.ecus.length);
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
