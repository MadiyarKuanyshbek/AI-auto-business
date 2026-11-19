import type { Elm327 } from "./elm327";
import { AdapterError } from "./transport";
import { bytesToAscii } from "./hex";

/** Коды отказа UDS (ISO 14229) — расшифровка для человека. */
export const NRC: Record<number, string> = {
  0x10: "Общий отказ",
  0x11: "Сервис не поддерживается",
  0x12: "Подфункция не поддерживается",
  0x13: "Неверная длина запроса",
  0x14: "Ответ слишком длинный",
  0x21: "Блок занят",
  0x22: "Условия не выполнены (например, двигатель запущен)",
  0x24: "Ошибка последовательности запросов",
  0x31: "Параметр вне диапазона / не поддерживается",
  0x33: "Нужна авторизация (Security Access)",
  0x35: "Неверный ключ",
  0x36: "Превышено число попыток",
  0x37: "Нужно подождать перед повтором",
  0x7e: "Подфункция не поддерживается в текущей сессии",
  0x7f: "Сервис не поддерживается в текущей сессии",
};

export type UdsResult =
  | { ok: true; data: number[] }
  | { ok: false; nrc: number; reason: string };

/** Отправка UDS-запроса одному блоку и разбор положительного/отрицательного ответа. */
export async function udsRequest(elm: Elm327, request: number[], timeoutMs = 5000): Promise<UdsResult> {
  const hex = request.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const messages = request.length > 7 ? await elm.requestLong(hex, timeoutMs) : await elm.request(hex, timeoutMs);
  const service = request[0];

  // Сначала положительный ответ, потом отказ; "ответ ожидается" (NRC 0x78) пропускаем.
  for (const m of messages) {
    if (m.data[0] === service + 0x40) return { ok: true, data: m.data.slice(1) };
  }
  for (const m of messages) {
    if (m.data[0] === 0x7f && m.data[1] === service && m.data[2] !== 0x78) {
      const nrc = m.data[2];
      return { ok: false, nrc, reason: NRC[nrc] ?? `Код отказа 0x${nrc.toString(16)}` };
    }
  }
  throw new AdapterError("Блок ещё обрабатывает запрос (ответ не получен)", "timeout");
}

/** ReadDataByIdentifier (0x22). */
export async function readDid(elm: Elm327, did: number): Promise<UdsResult> {
  const result = await udsRequest(elm, [0x22, did >> 8, did & 0xff]);
  if (!result.ok) return result;
  // Ответ: DID (2 байта) + данные.
  if (result.data[0] !== did >> 8 || result.data[1] !== (did & 0xff)) {
    throw new AdapterError("В ответе чужой идентификатор данных", "protocol");
  }
  return { ok: true, data: result.data.slice(2) };
}

/** Стандартные идентификационные DID (ISO 14229-1, приложение C) — есть у большинства блоков с 2008+ г. */
export const IDENT_DIDS: { did: number; key: IdentKey; label: string }[] = [
  { did: 0xf187, key: "sparePartNumber", label: "Номер запчасти (производитель авто)" },
  { did: 0xf188, key: "softwareNumber", label: "Номер ПО блока" },
  { did: 0xf189, key: "softwareVersion", label: "Версия ПО" },
  { did: 0xf18a, key: "supplierId", label: "Поставщик блока" },
  { did: 0xf18b, key: "manufacturingDate", label: "Дата изготовления" },
  { did: 0xf18c, key: "serialNumber", label: "Серийный номер" },
  { did: 0xf190, key: "vin", label: "VIN" },
  { did: 0xf191, key: "hardwareNumber", label: "Номер железа (HW)" },
  { did: 0xf192, key: "supplierHardwareNumber", label: "Номер железа поставщика" },
  { did: 0xf193, key: "supplierHardwareVersion", label: "Версия железа поставщика" },
  { did: 0xf194, key: "supplierSoftwareNumber", label: "Номер ПО поставщика (SW)" },
  { did: 0xf195, key: "supplierSoftwareVersion", label: "Версия ПО поставщика" },
  { did: 0xf197, key: "systemName", label: "Название системы" },
  { did: 0xf19e, key: "odxFile", label: "ODX-файл" },
];

export type IdentKey =
  | "sparePartNumber"
  | "softwareNumber"
  | "softwareVersion"
  | "supplierId"
  | "manufacturingDate"
  | "serialNumber"
  | "vin"
  | "hardwareNumber"
  | "supplierHardwareNumber"
  | "supplierHardwareVersion"
  | "supplierSoftwareNumber"
  | "supplierSoftwareVersion"
  | "systemName"
  | "odxFile";

export type EcuIdent = Partial<Record<IdentKey, string>>;

/** Читает все стандартные идентификационные DID блока; недоступные пропускает. */
export async function readIdentification(elm: Elm327): Promise<{ ident: EcuIdent; refused: number }> {
  const ident: EcuIdent = {};
  let refused = 0;
  for (const { did, key } of IDENT_DIDS) {
    try {
      const r = await readDid(elm, did);
      if (r.ok) {
        const text = bytesToAscii(r.data.filter((b) => b !== 0 && b !== 0xff));
        if (text) ident[key] = text;
      } else {
        refused++;
      }
    } catch (e) {
      if (e instanceof AdapterError && (e.code === "no_data" || e.code === "timeout")) continue;
      throw e;
    }
  }
  return { ident, refused };
}

// ───────────── KWP2000 (K-Line, авто примерно до 2008 г.) ─────────────

/** Локальные идентификаторы службы 0x1A (ReadECUIdentification, ISO 14230-3). */
export const KWP_IDENT_OPTIONS: { option: number; key: IdentKey }[] = [
  { option: 0x90, key: "vin" },
  { option: 0x91, key: "hardwareNumber" },
  { option: 0x92, key: "supplierHardwareNumber" },
  { option: 0x93, key: "supplierHardwareVersion" },
  { option: 0x94, key: "supplierSoftwareNumber" },
  { option: 0x95, key: "supplierSoftwareVersion" },
  { option: 0x97, key: "systemName" },
  { option: 0x99, key: "manufacturingDate" },
];

/** Читает идентификацию блока по KWP2000. Недоступные пункты пропускает. */
export async function readKwpIdentification(elm: Elm327): Promise<{ ident: EcuIdent; refused: number }> {
  const ident: EcuIdent = {};
  let refused = 0;
  for (const { option, key } of KWP_IDENT_OPTIONS) {
    try {
      const messages = await elm.request(`1A${option.toString(16).toUpperCase()}`);
      const positive = messages.find((m) => m.data[0] === 0x5a && m.data[1] === option);
      if (positive) {
        const text = bytesToAscii(positive.data.slice(2).filter((b) => b !== 0 && b !== 0xff));
        if (text) ident[key] = text;
      } else if (messages.some((m) => m.data[0] === 0x7f && m.data[1] === 0x1a)) {
        refused++;
      }
    } catch (e) {
      if (e instanceof AdapterError && (e.code === "no_data" || e.code === "timeout")) continue;
      throw e;
    }
  }
  return { ident, refused };
}
