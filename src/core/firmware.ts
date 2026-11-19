import type { Car } from "./cars";
import type { CatalogItem } from "./catalog";
import { ecuMatchesPackage } from "./install";
import { compareVersions, type FirmwarePackage } from "./package";
import type { ScannedEcu } from "./scanner";

export type LoadedPackageLike = { pkg: FirmwarePackage };
export type InstallRecordLike = { vin: string; ecuTxId: string; packageId: string; version: string };

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();

export type CarFirmware = {
  key: string;
  kind: "package" | "catalog";
  title: string;
  summary?: string;
  version?: string;
  /** Для каталога: demo / beta / verified. Пакеты считаются готовыми к установке. */
  status: "ready" | "demo" | "beta" | "verified";
  priceKzt?: number;
  roadLegal: boolean;
};

const yearsOverlap = (car: Car, from?: number, to?: number) => (from === undefined || (car.to ?? 9999) >= from) && (to === undefined || car.from <= to);

/** Какие прошивки известны для модели автомобиля: готовые пакеты и позиции каталога. */
export function firmwareForCar(car: Car, packages: LoadedPackageLike[], catalog: CatalogItem[]): CarFirmware[] {
  const out: CarFirmware[] = [];
  const make = norm(car.make);
  const model = norm(car.model);

  // Пакеты: берём последнюю версию каждого id.
  const latest = new Map<string, FirmwarePackage>();
  for (const { pkg } of packages) {
    const cur = latest.get(pkg.id);
    if (!cur || compareVersions(pkg.version, cur.version) > 0) latest.set(pkg.id, pkg);
  }
  for (const pkg of latest.values()) {
    const hit = pkg.target.vehicles?.some(
      (v) => norm(v.make) === make && (!v.model || model.includes(norm(v.model))) && yearsOverlap(car, v.from, v.to),
    );
    if (hit) out.push({ key: `pkg-${pkg.id}`, kind: "package", title: pkg.title, summary: pkg.description, version: pkg.version, status: "ready", priceKzt: pkg.priceKzt, roadLegal: pkg.roadLegal });
  }

  for (const item of catalog) {
    const c = item.compat;
    if (!c.makes?.length) continue; // позиции только по семейству блока видны после сканирования, а не в поиске по моделям
    if (!c.makes.some((m) => norm(m) === make)) continue;
    if (c.models?.length && !c.models.some((m) => model.includes(norm(m)))) continue;
    out.push({ key: `cat-${item.id}`, kind: "catalog", title: item.title, summary: item.summary, status: item.status, priceKzt: item.priceKzt, roadLegal: item.roadLegal });
  }
  return out;
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
