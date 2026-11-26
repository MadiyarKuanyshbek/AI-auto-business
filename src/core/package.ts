import { base64Decode, hexToBytes } from "./hex";
import { sha256Hex } from "./sha256";

/**
 * Пакет прошивки (.afpkg): всё, что нужно приложению, чтобы установить калибровку в блок без участия
 * человека — к каким блокам применим, какие данные и по каким адресам писать и в каком порядке
 * разговаривать с загрузчиком блока. Содержимое прошивки сюда кладёт тот, кто её готовит.
 */
export type SecuritySpec = {
  /** Уровень доступа UDS (нечётный: 0x01, 0x03, 0x11…); ответ на сид отправляется на уровень+1. */
  level: number;
  /** Идентификатор алгоритма вычисления ключа из сида (см. SECURITY_ALGORITHMS). */
  algorithm: string;
  params?: Record<string, number | string>;
};

export type UdsProcedure = {
  kind: "uds-download";
  /** Расширенная сессия перед программированием (обычно 0x03). */
  extendedSession?: number;
  /** Отключить запись ошибок (0x85 0x02) на время прошивки. */
  disableDtc?: boolean;
  /** Сессия программирования (обычно 0x02). */
  programmingSession: number;
  security?: SecuritySpec;
  /** Стирание: routineControl 0x31 0x01 <id> [данные]. */
  erase?: { routineId: number; dataHex?: string };
  /** Формат адреса и длины в RequestDownload: 0x44 = по 4 байта. */
  download: { dataFormat?: number; addressAndLengthFormat?: number };
  /** Проверка целостности после записи (routineControl). */
  check?: { routineId: number; dataHex?: string };
  /** Сброс блока после прошивки (0x11 <тип>), обычно 0x01. */
  resetType?: number;
  /** Область для резервной копии оригинала (ReadMemoryByAddress 0x23). Без неё резервной копии не будет. */
  backup?: { address: number; length: number; addressAndLengthFormat?: number; chunk?: number };
};

export type PackageSegment = { address: number; dataBase64: string; sha256: string };

export type FirmwarePackage = {
  format: "autoflash-package";
  formatVersion: 1;
  id: string;
  version: string;
  title: string;
  description?: string;
  /** Применим только к блокам с этими номерами ПО (точное совпадение). */
  target: {
    softwareNumbers: string[];
    txId?: string;
    rxId?: string;
    /** Для каких автомобилей предназначен пакет (показывается в поиске по моделям). */
    vehicles?: { make: string; model?: string; from?: number; to?: number }[];
  };
  /** Номер ПО, который должен показать блок после успешной прошивки (для проверки). */
  expectedSoftwareNumber?: string;
  procedure: UdsProcedure;
  segments: PackageSegment[];
  roadLegal: boolean;
  /** Что за пакет: калибровка двигателя, коробки, интерфейс экранов и т.д. */
  category?: "engine" | "transmission" | "interface" | "other";
  /** Для интерфейсных пакетов: какая тема экрана устанавливается (id темы из src/core/interfaces.ts). */
  interface?: { theme: string };
  /** Демонстрационный пакет: можно ставить только на виртуальный блок. */
  demo?: boolean;
  priceKzt?: number;
};

export type ParsedPackage = { ok: true; pkg: FirmwarePackage; segments: { address: number; data: Uint8Array }[] } | { ok: false; error: string };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Разбор и строгая проверка пакета: форма, адреса, контрольные суммы каждого сегмента. */
export function parsePackage(json: unknown): ParsedPackage {
  if (typeof json !== "object" || json === null) return { ok: false, error: "Это не пакет прошивки" };
  const p = json as Partial<FirmwarePackage>;
  if (p.format !== "autoflash-package" || p.formatVersion !== 1) return { ok: false, error: "Неизвестный формат пакета" };
  if (typeof p.id !== "string" || !p.id || typeof p.version !== "string" || typeof p.title !== "string") return { ok: false, error: "В пакете нет id, версии или названия" };
  if (!p.target || !Array.isArray(p.target.softwareNumbers) || p.target.softwareNumbers.length === 0) return { ok: false, error: "В пакете не указаны блоки, для которых он предназначен" };
  const proc = p.procedure;
  if (!proc || proc.kind !== "uds-download" || !isInt(proc.programmingSession) || !proc.download) return { ok: false, error: "Некорректная процедура прошивки" };
  if (!Array.isArray(p.segments) || p.segments.length === 0) return { ok: false, error: "В пакете нет данных для записи" };

  const segments: { address: number; data: Uint8Array }[] = [];
  for (const [i, seg] of p.segments.entries()) {
    if (!isInt(seg?.address) || typeof seg.dataBase64 !== "string" || typeof seg.sha256 !== "string") return { ok: false, error: `Сегмент ${i + 1}: неверное описание` };
    const data = Uint8Array.from(base64Decode(seg.dataBase64));
    if (data.length === 0) return { ok: false, error: `Сегмент ${i + 1}: пустые данные` };
    if (sha256Hex(data) !== seg.sha256.toLowerCase()) return { ok: false, error: `Сегмент ${i + 1}: контрольная сумма не совпала (файл повреждён или изменён)` };
    segments.push({ address: seg.address, data });
  }
  // Сегменты не должны пересекаться: иначе один перезапишет другой.
  const sorted = [...segments].sort((a, b) => a.address - b.address);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].address < sorted[i - 1].address + sorted[i - 1].data.length) return { ok: false, error: "Сегменты прошивки пересекаются по адресам" };
  }
  return { ok: true, pkg: p as FirmwarePackage, segments };
}

/** Собирает пакет из готовых байтов (для разработчика прошивок и для тестов). */
export function buildPackage(input: Omit<FirmwarePackage, "format" | "formatVersion" | "segments"> & { segments: { address: number; data: Uint8Array }[] }): FirmwarePackage {
  const { segments, ...rest } = input;
  return {
    format: "autoflash-package",
    formatVersion: 1,
    ...rest,
    segments: segments.map((s) => ({
      address: s.address,
      dataBase64: toBase64(s.data),
      sha256: sha256Hex(s.data),
    })),
  };
}

function toBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += chars[b0 >> 2] + chars[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[b2 & 63] : "=";
  }
  return out;
}

/** Сравнение версий вида "1.2.10" (числовое, по частям). Возвращает >0, если a новее b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ───────────── Вычисление ключа доступа (SecurityAccess) ─────────────

export type SeedKeyFn = (seed: number[], params: Record<string, number | string>) => number[];

/**
 * Алгоритмы seed→key. Они индивидуальны для семейства блоков и держатся в секрете производителями,
 * поэтому приложение содержит только демонстрационный алгоритм для виртуального блока.
 * Реальные алгоритмы добавляются сюда (по одному на семейство) теми, у кого есть на них права.
 */
export const SECURITY_ALGORITHMS: Record<string, SeedKeyFn> = {
  // Только для виртуального блока: ключ = (сид XOR константа) + 1 по каждому байту.
  "demo-xor-add": (seed, params) => {
    const mask = hexToBytes(String(params.maskHex ?? "5A"));
    return seed.map((b, i) => ((b ^ mask[i % mask.length]) + 1) & 0xff);
  },
};

export function computeKey(spec: SecuritySpec, seed: number[]): number[] | null {
  const fn = SECURITY_ALGORITHMS[spec.algorithm];
  return fn ? fn(seed, spec.params ?? {}) : null;
}
