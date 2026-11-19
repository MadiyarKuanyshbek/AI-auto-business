import { describe, expect, it } from "vitest";
import { Elm327 } from "../src/core/elm327";
import { scanVehicle, type VehicleScan } from "../src/core/scanner";
import { SimulatedAdapter } from "../src/core/sim/simulator";
import { DEMO_VEHICLES } from "../src/core/sim/vehicles";
import { sha256Hex } from "../src/core/sha256";
import { DEMO_CATALOG, analyzeScan, identifyFamily, matchCatalog, parseCatalog, type CatalogItem } from "../src/core/catalog";
import { ElmReadOnlyProvider, SimulatedFlashProvider, canStart, preflight, recoverOriginal, runFlash, type FlashRequest } from "../src/core/flash";

async function scan(i: number): Promise<VehicleScan> {
  const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[i])));
  await elm.open();
  return scanVehicle(elm, { online: false });
}

describe("sha256", () => {
  it("matches known vectors", () => {
    expect(sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const long = new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");
    expect(sha256Hex(long)).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });
});

describe("families and catalog", () => {
  it("recognises ECU families from identification", async () => {
    const vw = await scan(0);
    expect(identifyFamily(vw.ecus[0]).id).toBe("bosch-edc17");
    expect(identifyFamily(vw.ecus[1]).id).toBe("dsg-dq");
    expect(identifyFamily((await scan(2)).ecus[0]).id).toBe("denso");
  });
  it("matches catalog items by family and make", async () => {
    const m = matchCatalog(await scan(0), DEMO_CATALOG);
    expect(m.map((x) => x.item.id)).toEqual(expect.arrayContaining(["demo-edc17-stage1", "demo-dsg-shift"]));
    // BMW не VAG — DSG-позиция к нему не подходит
    const bmw = matchCatalog(await scan(1), DEMO_CATALOG).map((x) => x.item.id);
    expect(bmw).not.toContain("demo-dsg-shift");
  });
  it("gives advisories for a car with DTCs", async () => {
    const adv = analyzeScan(await scan(0));
    expect(adv.some((a) => /P0299/.test(a.text))).toBe(true);
  });
  it("parseCatalog drops malformed entries", () => {
    expect(parseCatalog([{ id: "x" }, null, "str", { ...DEMO_CATALOG[0] }])).toHaveLength(1);
    expect(parseCatalog({})).toEqual([]);
  });
});

describe("flash workflow", () => {
  const file = Uint8Array.from({ length: 4096 }, (_, i) => (i * 7 + 3) & 0xff);
  async function request(over: Partial<FlashRequest> = {}, itemOver: Partial<CatalogItem> = {}): Promise<FlashRequest> {
    const s = await scan(1); // BMW без ошибок
    const ecu = s.ecus[0];
    const item: CatalogItem = {
      ...DEMO_CATALOG[0],
      id: "t-exact",
      status: "verified",
      compat: { softwareNumbers: [ecu.ident.softwareVersion!] },
      fileRef: "f1",
      fileSha256: sha256Hex(file),
      ...itemOver,
    };
    const provider = new SimulatedFlashProvider();
    return {
      scan: s, ecu, item, file, provider, voltage: 13.8,
      backup: await provider.readOriginal(ecu, () => {}),
      ack: { customerConsent: true, legalNotice: true, offRoad: false },
      ...over,
    };
  }

  it("succeeds when every check passes", async () => {
    const req = await request();
    expect(canStart(preflight(req))).toBe(true);
    const out = await runFlash(req);
    expect(out.status).toBe("success");
    expect((req.provider as SimulatedFlashProvider).image).toEqual(file);
  });
  it("refuses over ELM327", async () => {
    const req = await request({ provider: new ElmReadOnlyProvider() });
    const out = await runFlash(req);
    expect(out.status).toBe("failed");
    expect(out.status === "failed" && out.error).toMatch(/ELM327/);
  });
  it("blocks on low voltage, missing backup, wrong hash, demo item, missing consent", async () => {
    for (const [over, item, re] of [
      [{ voltage: 11.9 }, {}, /Напряжение/],
      [{ backup: null }, {}, /резервной копии/],
      [{}, { fileSha256: "00".repeat(32) }, /НЕ совпадает/],
      [{}, { status: "demo" as const }, /демонстрационная/],
      [{ ack: { customerConsent: false, legalNotice: true, offRoad: false } }, {}, /Согласие/],
    ] as const) {
      const out = await runFlash(await request(over as Partial<FlashRequest>, item as Partial<CatalogItem>));
      expect(out.status).toBe("failed");
      expect(out.status === "failed" && out.error).toMatch(re);
    }
  });
  it("blocks when the ECU software number does not match exactly", async () => {
    const out = await runFlash(await request({}, { compat: { familyIds: ["bosch-edc17"] } }));
    expect(out.status === "failed" && out.error).toMatch(/номер ПО не совпал/);
  });
  it("detects a failed write and restores the original", async () => {
    const req = await request();
    const provider = req.provider as SimulatedFlashProvider;
    const original = provider.image.slice();
    provider.failAtFraction = 0.5;
    const out = await runFlash(req);
    expect(out.status === "failed" && out.needsRecovery).toBe(true);
    provider.failAtFraction = null;
    expect((await recoverOriginal(req)).ok).toBe(true);
    expect(provider.image).toEqual(original);
  });
});
