import type { VehicleScan } from "../core/scanner";
import { resolveModelYear } from "../core/vin";

/** Снимок настроек автомобиля при подключении: способ связи, адаптер и значения настроек блоков (кодирование). */
export type VehicleSnapshot = {
  at: number;
  /** Через что подключались: ble, wifi, serial, webbluetooth, demo. */
  via: string;
  label: string;
  adapter: { chip: string; protocol: string; bus: string; voltage: number | null };
  /** Значения настроек блоков по пакетам кодирования, которые подошли к этой машине. */
  coding: { pkgId: string; pkgTitle: string; ecuName: string; txId: string; did: number; value: number[] }[];
  dtcCount: number;
};

/** Снимок магнитолы (Android): модель, версия, процессор, язык, установленные приложения. */
export type HeadUnitSnapshot = {
  id: string;
  /** VIN автомобиля, к которому относится магнитола (пусто, если машина не была подключена). */
  vin: string;
  at: number;
  via: "wifi" | "usb";
  device: string;
  props: Record<string, string>;
  packages: string[];
};

export type VehicleRec = {
  id: string;
  vin: string;
  title: string;
  createdAt: number;
  /** Последние сканирования (новые — в конце). */
  scans: VehicleScan[];
  /** Снимки настроек при подключениях (новые — в конце). */
  snapshots?: VehicleSnapshot[];
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

/** Запись о кодировании блока: что было и что стало (по ней можно вернуть прежние настройки). */
export type CodingRecord = { id: string; vin: string; ecuName: string; txId: string; did: number; pkgId: string; pkgTitle: string; before: number[]; after: number[]; at: number };

/** Запись журнала файлов: что найдено, откуда скачано, для какой машины и что с этим сделано. */
export type FileLogEntry = {
  id: string;
  at: number;
  /** Тип файла: прошивка, кодирование, приложение, обновление магнитолы, прочее. */
  kind: "firmware" | "coding" | "apk" | "headunit" | "other";
  action: "downloaded" | "accepted" | "rejected" | "installed" | "restored" | "uninstalled";
  name: string;
  source?: string;
  sha256?: string;
  size?: number;
  car?: { title: string; vin: string };
  note?: string;
};

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
  /** Журнал кодирования блоков. */
  coding: CodingRecord[];
  /** Снимки магнитол, подключённых по ADB. */
  headUnits: HeadUnitSnapshot[];
  /** Журнал файлов: откуда что скачано, для какой машины и что сделано. */
  fileLog: FileLogEntry[];
  /** Оценки источников по домену: влияют на порядок и показ результатов поиска. */
  sourceRatings: Record<string, "good" | "bad">;
};

export const EMPTY_DATA: AppData = { settings: DEFAULT_SETTINGS, packages: [], installs: [], vehicles: [], media: {}, queue: [], coding: [], headUnits: [], fileLog: [], sourceRatings: {} };

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
    vehicles: arr<VehicleRec>(r.vehicles).map((v) => ({ ...v, scans: Array.isArray(v.scans) ? v.scans : [], snapshots: Array.isArray(v.snapshots) ? v.snapshots : [] })),
    media,
    queue: arr<QueueItem>(r.queue).filter((q) => typeof q.carId === "string" && typeof q.fileName === "string"),
    fileLog: arr<FileLogEntry>(r.fileLog).filter((f) => typeof f.name === "string" && typeof f.action === "string"),
    sourceRatings: ((o) => {
      const out: Record<string, "good" | "bad"> = {};
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (v === "good" || v === "bad") out[k] = v;
      return out;
    })((r as { sourceRatings?: unknown }).sourceRatings),
    headUnits: arr<HeadUnitSnapshot>(r.headUnits).filter((h) => typeof h.device === "string" && typeof h.props === "object"),
    coding: arr<CodingRecord>(r.coding).filter((c) => typeof c.txId === "string" && Array.isArray(c.before) && Array.isArray(c.after)),
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
