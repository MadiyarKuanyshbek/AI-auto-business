import type { Elm327 } from "./elm327";
import { AdapterError } from "./transport";
import { bytesToAscii } from "./hex";
import { describeDtc } from "./dtc";

// ───────────── Режим 01: текущие данные ─────────────

export type PidDef = {
  pid: number;
  name: string;
  unit: string;
  bytes: number;
  decode: (b: number[]) => number;
};

const u16 = (b: number[]) => b[0] * 256 + b[1];

export const PIDS: PidDef[] = [
  { pid: 0x04, name: "Нагрузка двигателя", unit: "%", bytes: 1, decode: (b) => (b[0] * 100) / 255 },
  { pid: 0x05, name: "Температура ОЖ", unit: "°C", bytes: 1, decode: (b) => b[0] - 40 },
  { pid: 0x06, name: "Коррекция топлива STFT (банк 1)", unit: "%", bytes: 1, decode: (b) => (b[0] - 128) * (100 / 128) },
  { pid: 0x07, name: "Коррекция топлива LTFT (банк 1)", unit: "%", bytes: 1, decode: (b) => (b[0] - 128) * (100 / 128) },
  { pid: 0x0b, name: "Давление во впуске (MAP)", unit: "кПа", bytes: 1, decode: (b) => b[0] },
  { pid: 0x0c, name: "Обороты двигателя", unit: "об/мин", bytes: 2, decode: (b) => u16(b) / 4 },
  { pid: 0x0d, name: "Скорость", unit: "км/ч", bytes: 1, decode: (b) => b[0] },
  { pid: 0x0e, name: "Угол опережения зажигания", unit: "°", bytes: 1, decode: (b) => b[0] / 2 - 64 },
  { pid: 0x0f, name: "Температура впуска", unit: "°C", bytes: 1, decode: (b) => b[0] - 40 },
  { pid: 0x10, name: "Расход воздуха (MAF)", unit: "г/с", bytes: 2, decode: (b) => u16(b) / 100 },
  { pid: 0x11, name: "Положение дросселя", unit: "%", bytes: 1, decode: (b) => (b[0] * 100) / 255 },
  { pid: 0x1f, name: "Время работы двигателя", unit: "с", bytes: 2, decode: (b) => u16(b) },
  { pid: 0x2f, name: "Уровень топлива", unit: "%", bytes: 1, decode: (b) => (b[0] * 100) / 255 },
  { pid: 0x33, name: "Атмосферное давление", unit: "кПа", bytes: 1, decode: (b) => b[0] },
  { pid: 0x42, name: "Напряжение бортсети (ЭБУ)", unit: "В", bytes: 2, decode: (b) => u16(b) / 1000 },
  { pid: 0x46, name: "Температура окружающего воздуха", unit: "°C", bytes: 1, decode: (b) => b[0] - 40 },
  { pid: 0x5c, name: "Температура масла", unit: "°C", bytes: 1, decode: (b) => b[0] - 40 },
];

export function pidDef(pid: number) {
  return PIDS.find((p) => p.pid === pid);
}

export type LiveValue = { pid: number; name: string; unit: string; value: number };

/** Ответ режима 01 без заголовка "41 PID": вернёт байты данных для нужного PID. */
function dataFor(messages: { data: number[] }[], service: number, pid?: number): number[] | null {
  for (const m of messages) {
    const d = m.data;
    if (d[0] !== service + 0x40) continue;
    if (pid === undefined) return d.slice(1);
    if (d[1] === pid) return d.slice(2);
  }
  return null;
}

export async function readPid(elm: Elm327, pid: number): Promise<LiveValue> {
  const def = pidDef(pid);
  if (!def) throw new AdapterError(`PID ${pid.toString(16)} не описан`, "unsupported");
  const hex = `01${pid.toString(16).padStart(2, "0")}`;
  const data = dataFor(await elm.request(hex), 0x01, pid);
  if (!data || data.length < def.bytes) throw new AdapterError("Неполный ответ", "protocol");
  return { pid, name: def.name, unit: def.unit, value: def.decode(data) };
}

/** Какие PID поддерживает авто (цепочка 0100, 0120, 0140, ...). */
export async function readSupportedPids(elm: Elm327): Promise<Set<number>> {
  const supported = new Set<number>();
  let base = 0x00;
  while (base <= 0xa0) {
    let data: number[] | null;
    try {
      data = dataFor(await elm.request(`01${base.toString(16).padStart(2, "0")}`), 0x01, base);
    } catch {
      break;
    }
    if (!data || data.length < 4) break;
    const mask = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
    for (let i = 0; i < 32; i++) {
      if (mask & (1 << (31 - i))) supported.add(base + i + 1);
    }
    if (!supported.has(base + 0x20)) break;
    base += 0x20;
  }
  return supported;
}

// ───────────── Режим 03/07/0A: коды неисправностей ─────────────

export type Dtc = { code: string; kind: "stored" | "pending" | "permanent"; description?: string };

const DTC_PREFIX = ["P0", "P1", "P2", "P3", "C0", "C1", "C2", "C3", "B0", "B1", "B2", "B3", "U0", "U1", "U2", "U3"];

export function decodeDtcPair(a: number, b: number): string | null {
  if (a === 0 && b === 0) return null;
  return `${DTC_PREFIX[a >> 4]}${(a & 0x0f).toString(16)}${b.toString(16).padStart(2, "0")}`.toUpperCase();
}

const DTC_SERVICES = { stored: 0x03, pending: 0x07, permanent: 0x0a } as const;

export async function readDtcs(elm: Elm327, kind: keyof typeof DTC_SERVICES): Promise<Dtc[]> {
  const service = DTC_SERVICES[kind];
  const hex = service.toString(16).padStart(2, "0").toUpperCase();
  let messages;
  try {
    messages = await elm.request(hex);
  } catch (e) {
    if (e instanceof AdapterError && e.code === "no_data") return []; // нет данных = нет кодов
    throw e;
  }
  const codes = new Set<string>();
  for (const m of messages) {
    if (m.data[0] !== service + 0x40) continue;
    // CAN: байт 1 — число кодов, пары идут со 2-го байта. K-Line/J1850: числа кодов нет, пары идут с 1-го.
    const first = elm.bus === "can11" || elm.bus === "can29" ? 2 : 1;
    for (let i = first; i + 1 < m.data.length; i += 2) {
      const code = decodeDtcPair(m.data[i], m.data[i + 1]);
      if (code) codes.add(code);
    }
  }
  return [...codes].map((code) => ({ code, kind, description: describeDtc(code) }));
}

/** Сброс ошибок (режим 04). Вызывать только после явного подтверждения пользователя. */
export async function clearDtcs(elm: Elm327): Promise<void> {
  const messages = await elm.request("04");
  if (!messages.some((m) => m.data[0] === 0x44)) throw new AdapterError("Блок не подтвердил сброс", "protocol");
}

// ───────────── Режим 09: идентификация ─────────────

export type Mode09Info = { vin?: string; calibrationIds: string[]; cvn: string[]; ecuName?: string };

function chunkAscii(data: number[], skip: number): string {
  return bytesToAscii(data.slice(skip).filter((b) => b !== 0));
}

/** Склеивает данные режима 09 из всех кадров (по K-Line каждый кадр — отдельное сообщение с номером). */
function joinMode09(messages: { data: number[] }[], pid: number): number[] | null {
  const parts = messages.filter((m) => m.data[0] === 0x49 && m.data[1] === pid);
  if (parts.length === 0) return null;
  return parts.flatMap((m) => m.data.slice(3));
}

/** VIN, Calibration ID (по нему подбирают файл прошивки), CVN, имя ЭБУ. */
export async function readMode09(elm: Elm327): Promise<Mode09Info> {
  const info: Mode09Info = { calibrationIds: [], cvn: [] };

  try {
    const payload = joinMode09(await elm.request("0902"), 0x02);
    if (payload) {
      const vin = bytesToAscii(payload.filter((b) => b !== 0)).replace(/\s/g, "");
      if (vin.length >= 11) info.vin = vin.slice(-17);
    }
  } catch {
    /* авто может не отдавать VIN по OBD — он будет прочитан через UDS/KWP */
  }

  try {
    const payload = joinMode09(await elm.request("0904"), 0x04);
    if (payload) {
      // Calibration ID: блоки по 16 байт ASCII.
      for (let i = 0; i < payload.length; i += 16) {
        const id = chunkAscii(payload.slice(i, i + 16), 0);
        if (id) info.calibrationIds.push(id);
      }
    }
  } catch {
    /* не поддерживается */
  }

  try {
    const payload = joinMode09(await elm.request("0906"), 0x06);
    if (payload) {
      for (let i = 0; i + 3 < payload.length; i += 4) {
        info.cvn.push(payload.slice(i, i + 4).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase());
      }
    }
  } catch {
    /* не поддерживается */
  }

  try {
    const payload = joinMode09(await elm.request("090A"), 0x0a);
    if (payload) info.ecuName = chunkAscii(payload, 0);
  } catch {
    /* не поддерживается */
  }

  return info;
}
