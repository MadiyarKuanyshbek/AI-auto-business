import type { CodingPackage } from "./coding";
import { codingFitsEcu } from "./coding";
import type { FirmwarePackage } from "./package";
import type { ScannedEcu } from "./scanner";

// Проверка «подойдёт ли это файл вашей машине»: по данным самого файла и по тому, что приложение знает о машине и магнитоле.
// Результат всегда осторожный: «подходит» означает «явных противоречий не найдено», а не гарантию.

export type Fit = { level: "ok" | "warn" | "bad" | "unknown"; text: string };

export type CarRef = { make: string; model?: string; year?: number | null };

const norm = (s: string) => s.trim().toLowerCase();

/** Приложение Android: процессор магнитолы должен быть из тех, под которые собрано приложение. */
export function fitApk(appAbis: string[], headAbi: string | undefined): Fit {
  if (appAbis.length === 0) return { level: "ok", text: "Приложение без встроенных библиотек: работает на любом процессоре." };
  if (!headAbi) return { level: "unknown", text: `Приложение собрано под ${appAbis.join(", ")}. Процессор магнитолы неизвестен: подключите магнитолу по Wi‑Fi или USB, и приложение проверит.` };
  const head = norm(headAbi.split(",")[0]);
  // 64-битные устройства arm умеют запускать и 32-битные приложения; обратное невозможно.
  const ok = appAbis.some((a) => norm(a) === head) || (head === "arm64-v8a" && appAbis.includes("armeabi-v7a")) || (head === "x86_64" && appAbis.includes("x86"));
  return ok
    ? { level: "ok", text: `Процессор магнитолы (${head}) подходит: приложение собрано под ${appAbis.join(", ")}.` }
    : { level: "bad", text: `Не подходит: приложение собрано под ${appAbis.join(", ")}, а процессор магнитолы ${head}.` };
}

const yearsOverlap = (car: CarRef, from?: number, to?: number) => !car.year || ((from === undefined || car.year >= from) && (to === undefined || car.year <= to));

/** Пакет прошивки: список машин в самом пакете против выбранной машины. */
export function fitFirmware(pkg: FirmwarePackage, car: CarRef | null): Fit {
  const list = pkg.target.vehicles ?? [];
  if (!car) return { level: "unknown", text: "Машина не выбрана: подключитесь или укажите марку и модель." };
  if (list.length === 0) return { level: "warn", text: "В пакете не указано, для каких машин он составлен: проверяйте по номеру ПО блока." };
  const hit = list.some((v) => norm(v.make) === norm(car.make) && (!v.model || !car.model || norm(car.model).includes(norm(v.model)) || norm(v.model).includes(norm(car.model))) && yearsOverlap(car, v.from, v.to));
  return hit
    ? { level: "ok", text: `Пакет составлен для ${car.make}${car.model ? ` ${car.model}` : ""}. Версию ПО блока приложение сверит перед установкой.` }
    : { level: "bad", text: `Не подходит: пакет составлен для ${list.map((v) => [v.make, v.model].filter(Boolean).join(" ")).join(", ")}.` };
}

/** Пакет кодирования: блок должен быть у машины и версия его ПО подходить. */
export function fitCoding(pkg: CodingPackage, ecus: ScannedEcu[] | null, car: CarRef | null): Fit {
  if (ecus && ecus.length > 0) {
    const target = ecus.find((e) => e.txId.toUpperCase() === pkg.target.txId.toUpperCase());
    if (!target) return { level: "bad", text: `Не подходит: у подключённой машины нет блока с адресом ${pkg.target.txId}.` };
    return codingFitsEcu(pkg, target)
      ? { level: "ok", text: `Подходит: блок «${target.name}» найден и версия его ПО совпадает с пакетом.` }
      : { level: "bad", text: `Не подходит: блок «${target.name}» найден, но версия его ПО не совпадает с тем, под что составлен пакет.` };
  }
  const list = pkg.target.vehicles ?? [];
  if (!car || list.length === 0) return { level: "unknown", text: "Подключитесь к машине: приложение сверит блок и версию ПО." };
  const hit = list.some((v) => norm(v.make) === norm(car.make) && yearsOverlap(car, v.from, v.to));
  return hit ? { level: "warn", text: "Марка и год подходят, но блок и версию ПО можно проверить только при подключении к машине." } : { level: "bad", text: `Не подходит: пакет для ${list.map((v) => v.make).join(", ")}.` };
}
