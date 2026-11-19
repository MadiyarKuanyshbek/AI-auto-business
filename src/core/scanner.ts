import { Elm327 } from "./elm327";
import { AdapterError } from "./transport";
import { readDtcs, readMode09, readSupportedPids, type Dtc, type Mode09Info } from "./obd";
import { readIdentification, type EcuIdent } from "./uds";
import { decodeVinOffline, decodeVinOnline, type VinInfo, type VinOnline } from "./vin";

export type ScannedEcu = {
  name: string;
  txId: string;
  rxId: string;
  ident: EcuIdent;
  /** Сколько идентификаторов блок отказался отдавать (защита). */
  refused: number;
};

export type VehicleScan = {
  scannedAt: number;
  adapter: { version: string; voltage: number | null; protocol: string };
  vin?: string;
  vinInfo?: VinInfo;
  vinOnline?: VinOnline | null;
  mode09: Mode09Info;
  supportedPids: number[];
  dtcs: Dtc[];
  ecus: ScannedEcu[];
  warnings: string[];
};

/** Известные пары адресов CAN 11 бит: 7E0..7E7 ↔ 7E8..7EF (стандарт OBD-II/UDS) плюс частые адреса производителей. */
export const CANDIDATE_ECUS: { name: string; txId: string; rxId: string }[] = [
  { name: "Двигатель", txId: "7E0", rxId: "7E8" },
  { name: "Коробка передач", txId: "7E1", rxId: "7E9" },
  { name: "Блок 3 (ABS/гибрид)", txId: "7E2", rxId: "7EA" },
  { name: "Блок 4", txId: "7E3", rxId: "7EB" },
  { name: "Блок 5", txId: "7E4", rxId: "7EC" },
  { name: "Блок 6", txId: "7E5", rxId: "7ED" },
  { name: "Блок 7", txId: "7E6", rxId: "7EE" },
  { name: "Блок 8", txId: "7E7", rxId: "7EF" },
];

export type ScanProgress = (step: string, fraction: number) => void;

/**
 * Полное сканирование авто: идентификация, блоки, версии ПО, ошибки.
 * Только чтение — ничего не пишет в блоки, сессии диагностики не переключает.
 */
export async function scanVehicle(
  elm: Elm327,
  options: { onProgress?: ScanProgress; online?: boolean } = {},
): Promise<VehicleScan> {
  const progress = options.onProgress ?? (() => {});
  const warnings: string[] = [];

  progress("Подключение к адаптеру", 0.02);
  const init = await elm.init();
  const adapter = { version: init.version, voltage: init.voltage, protocol: "—" };
  if (init.voltage !== null && init.voltage < 11.8) {
    warnings.push(`Низкое напряжение бортсети (${init.voltage.toFixed(1)} В): запустите двигатель или подключите зарядное устройство.`);
  }

  progress("Поиск протокола и чтение данных OBD", 0.1);
  let mode09: Mode09Info = { calibrationIds: [], cvn: [] };
  let supportedPids: number[] = [];
  let dtcs: Dtc[] = [];
  try {
    supportedPids = [...(await readSupportedPids(elm))].sort((a, b) => a - b);
    adapter.protocol = await elm.protocol().catch(() => "—");
    mode09 = await readMode09(elm);
    progress("Чтение ошибок", 0.3);
    dtcs = [...(await readDtcs(elm, "stored")), ...(await readDtcs(elm, "pending")), ...(await readDtcs(elm, "permanent"))];
  } catch (e) {
    if (e instanceof AdapterError && e.code === "bus_error") {
      throw new AdapterError("Адаптер подключён, но не видит шину авто. Включите зажигание и повторите.", "bus_error");
    }
    warnings.push(`OBD-II: ${e instanceof Error ? e.message : "ошибка"}`);
  }

  const ecus: ScannedEcu[] = [];
  let index = 0;
  for (const cand of CANDIDATE_ECUS) {
    index++;
    progress(`Опрос блока ${cand.txId}`, 0.35 + (0.55 * index) / CANDIDATE_ECUS.length);
    try {
      await elm.target(cand.txId, cand.rxId);
      const { ident, refused } = await readIdentification(elm);
      if (Object.keys(ident).length > 0 || refused > 0) {
        ecus.push({ ...cand, name: ident.systemName ? `${cand.name} · ${ident.systemName}` : cand.name, ident, refused });
      }
    } catch (e) {
      if (e instanceof AdapterError && e.code === "bus_error") warnings.push(`${cand.txId}: ошибка шины`);
      // no_data / timeout — блока на этом адресе нет
    }
  }
  await elm.clearTarget().catch(() => undefined);

  // VIN: сначала OBD, затем идентификатор F190 любого блока.
  const vin = mode09.vin ?? ecus.map((e) => e.ident.vin).find((v) => v && v.length >= 11);
  let vinInfo: VinInfo | undefined;
  let vinOnline: VinOnline | null | undefined;
  if (vin) {
    vinInfo = decodeVinOffline(vin);
    if (options.online !== false) {
      progress("Определение модели по VIN", 0.95);
      vinOnline = await decodeVinOnline(vinInfo.vin);
    }
  } else {
    warnings.push("VIN не получен: блок не отдаёт его по OBD и по UDS.");
  }

  progress("Готово", 1);
  return { scannedAt: Date.now(), adapter, vin: vinInfo?.vin ?? vin, vinInfo, vinOnline, mode09, supportedPids, dtcs, ecus, warnings };
}
