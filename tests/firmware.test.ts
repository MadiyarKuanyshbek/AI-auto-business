import { describe, expect, it } from "vitest";
import { ALL_CARS, searchCars } from "../src/core/cars";
import { firmwareForCar, packagesForEcu } from "../src/core/firmware";
import { Elm327 } from "../src/core/elm327";
import { scanVehicle } from "../src/core/scanner";
import { DEMO_PACKAGES, DEMO_PACKAGE_V1, DEMO_PACKAGE_V1_1 } from "../src/core/sim/demoPackage";
import { SimulatedAdapter } from "../src/core/sim/simulator";
import { DEMO_VEHICLES } from "../src/core/sim/vehicles";

const pk = DEMO_PACKAGES.map((pkg) => ({ pkg }));

describe("firmware lookup by car model", () => {
  it("shows the demo package for the matching Golf and nothing for unrelated cars", () => {
    const golf6 = searchCars("golf 2010").find((c) => /Golf Mk6/.test(c.model))!;
    const entries = firmwareForCar(golf6, pk);
    expect(entries.some((e) => e.kind === "package" && e.version === "1.1.0")).toBe(true); // последняя версия
    const camry = ALL_CARS.find((c) => /Camry XV70/.test(c.model))!;
    expect(firmwareForCar(camry, pk).filter((e) => e.kind === "package")).toEqual([]);
    expect(firmwareForCar(camry, [])).toEqual([]);
  });
  it("does not match the package to a Golf outside its years", () => {
    const golf8 = ALL_CARS.find((c) => /Golf Mk8/.test(c.model))!;
    expect(firmwareForCar(golf8, pk).filter((e) => e.kind === "package")).toEqual([]);
  });
});

describe("install / update state for a scanned ECU", () => {
  it("offers install, then update, then current", async () => {
    const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[0])));
    await elm.open();
    const scan = await scanVehicle(elm, { online: false });
    const ecu = scan.ecus[0];
    const vin = scan.vin!;

    let s = packagesForEcu(ecu, vin, pk, []);
    expect(s).toHaveLength(1);
    expect(s[0].state).toBe("install");
    expect(s[0].pkg.version).toBe("1.1.0");

    s = packagesForEcu(ecu, vin, [{ pkg: DEMO_PACKAGE_V1 }, { pkg: DEMO_PACKAGE_V1_1 }], [{ vin, ecuTxId: ecu.txId, packageId: "demo-golf-stage1", version: "1.0.0" }]);
    expect(s[0].state).toBe("update");
    expect(s[0].installedVersion).toBe("1.0.0");

    s = packagesForEcu(ecu, vin, pk, [{ vin, ecuTxId: ecu.txId, packageId: "demo-golf-stage1", version: "1.1.0" }]);
    expect(s[0].state).toBe("current");
  });
  it("offers nothing for a different car", async () => {
    const elm = new Elm327(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[1])));
    await elm.open();
    const scan = await scanVehicle(elm, { online: false });
    expect(packagesForEcu(scan.ecus[0], scan.vin, pk, [])).toEqual([]);
  });
});
