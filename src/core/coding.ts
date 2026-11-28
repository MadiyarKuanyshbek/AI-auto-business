import type { Elm327 } from "./elm327";
import { computeKey, type SecuritySpec } from "./package";
import type { ScannedEcu } from "./scanner";
import { readDid, udsRequest } from "./uds";

/**
 * Кодирование блока: запись настроек (например, во внутренний параметр блока по идентификатору DID), а не прошивки.
 * Так на многих машинах включают и выключают функции. Приложение не знает, какой байт за что отвечает: это описывает пакет
 * кодирования (его составляет тот, у кого есть проверенные данные по блоку). Всё ниже работает по стандарту UDS:
 * чтение 0x22 → расширенная сессия 0x10 → доступ 0x27 (если нужен) → запись 0x2E → проверочное чтение → откат при сбое.
 */

export type CodingChange = {
  /** Номер байта в значении DID (с нуля). */
  byte: number;
  /** Какие биты меняются (маска). */
  mask: number;
  /** Новое значение этих битов (в тех же позициях, что и маска). */
  value: number;
};

export type CodingOption = {
  id: string;
  title: string;
  /** Что изменится на машине, простыми словами. */
  description: string;
  changes: CodingChange[];
};

export type CodingPackage = {
  format: "autoflash-coding";
  version: 1;
  id: string;
  title: string;
  description: string;
  target: {
    txId: string;
    /** Идентификатор данных (DID), например 0x0600. */
    did: number;
    /** Ожидаемая длина значения в байтах: защита от записи не в тот блок. */
    length: number;
    /** Номера ПО блока, под которые составлен пакет (пусто: любая версия). */
    softwareNumbers?: string[];
    vehicles?: { make: string; model?: string; from?: number; to?: number }[];
  };
  /** Сессия записи (обычно 0x03, расширенная). */
  session: number;
  security?: SecuritySpec;
  options: CodingOption[];
  roadLegal: boolean;
  demo?: boolean;
};

export type CodingParse = { ok: true; pkg: CodingPackage } | { ok: false; error: string };

export function parseCodingPackage(raw: unknown): CodingParse {
  const r = raw as Partial<CodingPackage> | null;
  if (!r || typeof r !== "object" || r.format !== "autoflash-coding") return { ok: false, error: "Это не пакет кодирования AutoFlash" };
  if (r.version !== 1) return { ok: false, error: "Неизвестная версия формата пакета кодирования" };
  if (typeof r.id !== "string" || !/^[\w.\-]{1,80}$/.test(r.id)) return { ok: false, error: "Некорректный идентификатор пакета" };
  if (typeof r.title !== "string" || !r.title.trim()) return { ok: false, error: "У пакета нет названия" };
  const t = r.target;
  if (!t || typeof t.txId !== "string" || !/^[0-9A-Fa-f]{2,8}$/.test(t.txId)) return { ok: false, error: "Не указан адрес блока (txId)" };
  if (!Number.isInteger(t.did) || t.did < 0 || t.did > 0xffff) return { ok: false, error: "Некорректный идентификатор данных (DID)" };
  if (!Number.isInteger(t.length) || t.length < 1 || t.length > 255) return { ok: false, error: "Длина значения должна быть от 1 до 255 байт" };
  if (!Number.isInteger(r.session) || (r.session as number) < 1 || (r.session as number) > 0x7f) return { ok: false, error: "Некорректная сессия записи" };
  if (!Array.isArray(r.options) || r.options.length === 0) return { ok: false, error: "В пакете нет ни одной настройки" };
  const ids = new Set<string>();
  for (const o of r.options) {
    if (!o || typeof o.id !== "string" || typeof o.title !== "string" || typeof o.description !== "string") return { ok: false, error: "Настройка описана неполно (нужны id, title, description)" };
    if (ids.has(o.id)) return { ok: false, error: `Повторяется настройка ${o.id}` };
    ids.add(o.id);
    if (!Array.isArray(o.changes) || o.changes.length === 0) return { ok: false, error: `У настройки «${o.title}» нет изменений` };
    for (const c of o.changes) {
      if (!Number.isInteger(c.byte) || c.byte < 0 || c.byte >= t.length) return { ok: false, error: `Настройка «${o.title}»: байт ${c.byte} вне значения длиной ${t.length}` };
      if (!Number.isInteger(c.mask) || c.mask < 1 || c.mask > 255) return { ok: false, error: `Настройка «${o.title}»: некорректная маска` };
      if (!Number.isInteger(c.value) || c.value < 0 || c.value > 255 || (c.value & ~c.mask) !== 0) return { ok: false, error: `Настройка «${o.title}»: значение выходит за маску` };
    }
  }
  if (typeof r.roadLegal !== "boolean") return { ok: false, error: "Не указано, разрешено ли это для дорог общего пользования" };
  return { ok: true, pkg: r as CodingPackage };
}

/** Применяет выбранные настройки к исходному значению: возвращает новое значение. */
export function applyOptions(original: number[], pkg: CodingPackage, optionIds: string[]): number[] {
  const out = [...original];
  for (const o of pkg.options) {
    if (!optionIds.includes(o.id)) continue;
    for (const c of o.changes) out[c.byte] = (out[c.byte] & ~c.mask & 0xff) | (c.value & c.mask);
  }
  return out;
}

/** Какие настройки пакета уже включены в текущем значении (все их изменения совпадают). */
export function activeOptions(current: number[], pkg: CodingPackage): string[] {
  return pkg.options.filter((o) => o.changes.every((c) => ((current[c.byte] ?? 0) & c.mask) === (c.value & c.mask))).map((o) => o.id);
}

export type ByteDiff = { byte: number; before: number; after: number };
export function diffBytes(before: number[], after: number[]): ByteDiff[] {
  const out: ByteDiff[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) if (before[i] !== after[i]) out.push({ byte: i, before: before[i] ?? 0, after: after[i] ?? 0 });
  return out;
}

export const bytesHex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, "0")).join(" ").toUpperCase();

/** Подходит ли пакет блоку: адрес, и версия ПО (если пакет её указывает). */
export function codingFitsEcu(pkg: CodingPackage, ecu: ScannedEcu): boolean {
  if (pkg.target.txId.toUpperCase() !== ecu.txId.toUpperCase()) return false;
  if (!pkg.target.softwareNumbers?.length) return true;
  const have = [ecu.ident.softwareNumber, ecu.ident.supplierSoftwareNumber, ecu.ident.softwareVersion, ecu.ident.sparePartNumber].filter((v): v is string => !!v);
  return have.some((h) => pkg.target.softwareNumbers!.some((n) => h.includes(n) || n.includes(h)));
}

export async function readCoding(elm: Elm327, ecu: ScannedEcu, pkg: CodingPackage): Promise<number[]> {
  await elm.target(ecu.txId, ecu.rxId);
  const r = await readDid(elm, pkg.target.did);
  if (!r.ok) throw new Error(`Блок не отдал текущие настройки: ${r.reason}`);
  if (r.data.length !== pkg.target.length) throw new Error(`Длина настроек блока ${r.data.length} байт, ожидалось ${pkg.target.length}: пакет не для этого блока`);
  return r.data;
}

export type CodingOutcome =
  | { status: "success"; before: number[]; after: number[] }
  | { status: "failed"; error: string; rolledBack: boolean };

/**
 * Записывает новое значение настроек. Перед записью оригинал уже прочитан (его возвращает readCoding, его же нужно сохранить).
 * Если запись или проверочное чтение не удались, оригинал записывается обратно.
 */
export async function writeCoding(elm: Elm327, ecu: ScannedEcu, pkg: CodingPackage, original: number[], next: number[], onStep: (s: string) => void = () => {}): Promise<CodingOutcome> {
  const did = [pkg.target.did >> 8, pkg.target.did & 0xff];
  const open = async () => {
    await elm.target(ecu.txId, ecu.rxId);
    const s = await udsRequest(elm, [0x10, pkg.session]);
    if (!s.ok) throw new Error(`Блок не открыл сессию записи: ${s.reason}`);
    if (pkg.security) {
      const seed = await udsRequest(elm, [0x27, pkg.security.level]);
      if (!seed.ok) throw new Error(`Запрос доступа отклонён: ${seed.reason}`);
      const seedBytes = seed.data.slice(1);
      if (seedBytes.every((b) => b === 0)) return; // уже разблокирован
      const key = computeKey(pkg.security, seedBytes);
      if (!key) throw new Error(`Нет алгоритма доступа «${pkg.security.algorithm}»: без него блок не примет запись`);
      const k = await udsRequest(elm, [0x27, pkg.security.level + 1, ...key]);
      if (!k.ok) throw new Error(`Блок не принял ключ доступа: ${k.reason}`);
    }
  };
  const write = async (value: number[]) => {
    const w = await udsRequest(elm, [0x2e, ...did, ...value]);
    if (!w.ok) throw new Error(`Блок отказал в записи: ${w.reason}`);
  };

  try {
    onStep("Открываю сессию записи");
    await open();
    onStep("Записываю настройки");
    await write(next);
    onStep("Проверяю запись");
    const back = await readDid(elm, pkg.target.did);
    if (!back.ok || back.data.length !== next.length || back.data.some((b, i) => b !== next[i])) throw new Error("После записи блок вернул не то, что записано");
    return { status: "success", before: original, after: next };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Ошибка записи";
    try {
      onStep("Возвращаю прежние настройки");
      await open();
      await write(original);
      const check = await readDid(elm, pkg.target.did);
      const same = check.ok && check.data.length === original.length && check.data.every((b, i) => b === original[i]);
      return { status: "failed", error, rolledBack: same };
    } catch {
      return { status: "failed", error, rolledBack: false };
    }
  }
}
