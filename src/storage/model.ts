import type { VehicleScan } from "../core/scanner";
import { resolveModelYear } from "../core/vin";

export type Customer = { id: string; name: string; phone: string; notes: string; createdAt: number };

export type VehicleRec = {
  id: string;
  customerId: string | null;
  vin: string;
  title: string;
  plate: string;
  createdAt: number;
  /** Последние сканирования (новые — в конце). */
  scans: VehicleScan[];
};

export const JOB_STATUSES = ["new", "diagnostics", "awaiting_file", "ready_to_flash", "done", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  new: "Новый",
  diagnostics: "Диагностика",
  awaiting_file: "Ждём файл",
  ready_to_flash: "Готов к прошивке",
  done: "Выполнен",
  cancelled: "Отменён",
};

export type Job = {
  id: string;
  vehicleId: string | null;
  customerId: string | null;
  title: string;
  status: JobStatus;
  priceKzt: number;
  paidKzt: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
  log: { t: number; text: string }[];
};

export type AppData = {
  customers: Customer[];
  vehicles: VehicleRec[];
  jobs: Job[];
  /** Позиции каталога, загруженные пользователем (JSON). Демо-позиции встроены в код. */
  catalogJson: unknown;
};

export const EMPTY_DATA: AppData = { customers: [], vehicles: [], jobs: [], catalogJson: [] };

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Приводит то, что лежит в хранилище, к безопасной форме (повреждённые записи не должны ронять приложение). */
export function sanitizeData(raw: unknown): AppData {
  const r = (raw ?? {}) as Partial<AppData>;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as T[]) : []);
  return {
    customers: arr<Customer>(r.customers),
    vehicles: arr<VehicleRec>(r.vehicles).map((v) => ({ ...v, scans: Array.isArray(v.scans) ? v.scans : [] })),
    jobs: arr<Job>(r.jobs).map((j) => ({ ...j, log: Array.isArray(j.log) ? j.log : [] })),
    catalogJson: Array.isArray(r.catalogJson) ? r.catalogJson : [],
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

export function formatKzt(n: number) {
  return `${Math.round(n).toLocaleString("ru-RU")} ₸`;
}
