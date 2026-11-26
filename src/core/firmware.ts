import type { Car } from "./cars";
import { ecuMatchesPackage } from "./install";
import { compareVersions, type FirmwarePackage } from "./package";
import type { ScannedEcu } from "./scanner";

export type LoadedPackageLike = { pkg: FirmwarePackage };
export type InstallRecordLike = { vin: string; ecuTxId: string; packageId: string; version: string };

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();

export type CarFirmware = {
  key: string;
  kind: "package";
  title: string;
  summary?: string;
  version?: string;
  status: "ready" | "demo";
  priceKzt?: number;
  roadLegal: boolean;
};

const yearsOverlap = (car: Car, from?: number, to?: number) => (from === undefined || (car.to ?? 9999) >= from) && (to === undefined || car.from <= to);

/** Последние версии пакетов, предназначенных для этой модели (по списку автомобилей в пакете). */
export function packagesForCar(car: Car, packages: LoadedPackageLike[]): FirmwarePackage[] {
  const make = norm(car.make);
  const model = norm(car.model);
  const latest = new Map<string, FirmwarePackage>();
  for (const { pkg } of packages) {
    const cur = latest.get(pkg.id);
    if (!cur || compareVersions(pkg.version, cur.version) > 0) latest.set(pkg.id, pkg);
  }
  return [...latest.values()].filter((pkg) =>
    pkg.target.vehicles?.some((v) => norm(v.make) === make && (!v.model || model.includes(norm(v.model))) && yearsOverlap(car, v.from, v.to)),
  );
}

/** Какие прошивки известны для модели автомобиля. */
export function firmwareForCar(car: Car, packages: LoadedPackageLike[]): CarFirmware[] {
  return packagesForCar(car, packages).map((pkg) => ({
    key: `pkg-${pkg.id}`,
    kind: "package" as const,
    title: pkg.title,
    summary: pkg.description,
    version: pkg.version,
    status: pkg.demo ? ("demo" as const) : ("ready" as const),
    priceKzt: pkg.priceKzt,
    roadLegal: pkg.roadLegal,
  }));
}

export type EcuPackageState = {
  pkg: FirmwarePackage;
  /** install — ещё не ставили; update — есть версия новее установленной; current — стоит последняя версия. */
  state: "install" | "update" | "current";
  installedVersion?: string;
};

/** Пакеты, применимые к блоку: что можно установить, что обновить и что уже актуально. */
export function packagesForEcu(ecu: ScannedEcu, vin: string | undefined, packages: LoadedPackageLike[], installs: InstallRecordLike[]): EcuPackageState[] {
  const latest = new Map<string, FirmwarePackage>();
  for (const { pkg } of packages) {
    const cur = latest.get(pkg.id);
    if (!cur || compareVersions(pkg.version, cur.version) > 0) latest.set(pkg.id, pkg);
  }
  const out: EcuPackageState[] = [];
  for (const pkg of latest.values()) {
    const rec = vin ? installs.filter((r) => r.vin === vin && r.ecuTxId === ecu.txId && r.packageId === pkg.id).sort((a, b) => compareVersions(b.version, a.version))[0] : undefined;
    if (rec && compareVersions(rec.version, pkg.version) >= 0) {
      out.push({ pkg, state: "current", installedVersion: rec.version });
    } else if (ecuMatchesPackage(ecu, pkg)) {
      out.push({ pkg, state: rec ? "update" : "install", installedVersion: rec?.version });
    }
  }
  return out;
}
