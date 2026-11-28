import type { VehicleScan } from "../core/scanner";
import { resolveModelYear } from "../core/vin";

export type VehicleRec = {
  id: string;
  vin: string;
  title: string;
  createdAt: number;
  /** Последние сканирования (новые — в конце). */
  scans: VehicleScan[];
};

export type Settings = {
  /** Показывать демо-автомобили и демо-пакеты. После первого скана настоящего авто выключается само. */
  showDemo: boolean;
  /** Хотя бы раз сканировали настоящий автомобиль (не демо). */
  hadRealScan: boolean;
  /** Дата последней автоматической резервной копии (ГГГГ-ММ-ДД). */
  lastBackupDay: string;
  /** Определять модель по VIN через интернет (VIN отправляется в базу NHTSA, США). */
  onlineVin: boolean;
};

export const DEFAULT_SETTINGS: Settings = { showDemo: true, hadRealScan: false, lastBackupDay: "", onlineVin: true };

/** Что и когда установлено в блок автомобиля (по VIN) — по этому находим доступные обновления. */
export type InstallRecord = { vin: string; ecuTxId: string; packageId: string; version: string; at: number; softwareAfter?: string };

/** Фото салона и ссылки на видео, которые пользователь прикрепил к автомобилю из справочника. */
export type CarMedia = { id: string; kind: "image" | "link"; title: string; url: string };

/** Файл интерфейса, подготовленный заранее (без адаптера): ставится при подключении к этому автомобилю. */
export type QueueItem = { id: string; carId: string; carTitle: string; themeId: string; fileName: string; title: string; at: number };

export type AppData = {
  settings: Settings;
  /** Загруженные и созданные пакеты прошивки (сырой JSON; проверяются при чтении). */
  packages: unknown[];
  installs: InstallRecord[];
  vehicles: VehicleRec[];
  /** Прикреплённые к моделям материалы: ключ — id записи справочника. */
  media: Record<string, CarMedia[]>;
  /** Очередь установки: подготовлено заранее, ждёт подключения к автомобилю. */
  queue: QueueItem[];
};

export const EMPTY_DATA: AppData = { settings: DEFAULT_SETTINGS, packages: [], installs: [], vehicles: [], media: {}, queue: [] };

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Приводит то, что лежит в хранилище, к безопасной форме (повреждённые записи не должны ронять приложение). */
export function sanitizeData(raw: unknown): AppData {
  const r = (raw ?? {}) as Partial<AppData> & Record<string, unknown>;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as T[]) : []);
  const st = (r.settings ?? {}) as Partial<Settings>;
  const media: Record<string, CarMedia[]> = {};
  if (r.media && typeof r.media === "object") {
    for (const [k, v] of Object.entries(r.media)) {
      media[k] = arr<CarMedia>(v).filter((m) => typeof m.url === "string" && (m.kind === "image" || m.kind === "link"));
    }
  }
  return {
    settings: {
      showDemo: typeof st.showDemo === "boolean" ? st.showDemo : true,
      hadRealScan: st.hadRealScan === true,
      lastBackupDay: typeof st.lastBackupDay === "string" ? st.lastBackupDay : "",
      onlineVin: st.onlineVin !== false,
    },
    packages: Array.isArray(r.packages) ? r.packages.filter((x) => x && typeof x === "object") : [],
    installs: arr<InstallRecord>(r.installs),
    vehicles: arr<VehicleRec>(r.vehicles).map((v) => ({ ...v, scans: Array.isArray(v.scans) ? v.scans : [] })),
    media,
    queue: arr<QueueItem>(r.queue).filter((q) => typeof q.carId === "string" && typeof q.fileName === "string"),
  };
}

export function vehicleTitle(scan: VehicleScan): string {
  const o = scan.vinOnline;
  const i = scan.vinInfo;
  const make = o?.make ?? i?.make ?? "Автомобиль";
  const model = o?.model ?? "";
  const year = resolveModelYear(i, o);
  return [make, model, year ? `(${year})` : ""].filter(Boolean).join(" ");
}
