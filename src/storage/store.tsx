import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { VehicleScan } from "../core/scanner";
import { desktopBridge } from "../transport/desktop";
import { EMPTY_DATA, newId, sanitizeData, vehicleTitle, type AppData, type Customer, type Job, type Settings, type VehicleRec } from "./model";

const KEY = "autoflash.v1";
const MAX_SCANS_PER_VEHICLE = 5;

type Store = {
  loaded: boolean;
  data: AppData;
  addCustomer(c: Pick<Customer, "name" | "phone" | "notes">): Customer;
  updateCustomer(id: string, patch: Partial<Customer>): void;
  removeCustomer(id: string): void;
  /** Сохраняет результат сканирования: находит авто по VIN или создаёт карточку. */
  saveScan(scan: VehicleScan, customerId?: string | null): VehicleRec;
  updateVehicle(id: string, patch: Partial<VehicleRec>): void;
  addJob(j: Pick<Job, "title"> & Partial<Job>): Job;
  updateJob(id: string, patch: Partial<Job>): void;
  logJob(id: string, text: string): void;
  removeJob(id: string): void;
  setCatalogJson(json: unknown): void;
  updateSettings(patch: Partial<Settings>): void;
  /** Полная копия данных в виде JSON-текста (для резервной копии и переноса на другой компьютер). */
  exportJson(): string;
  /** Заменяет все данные содержимым копии. Возвращает false, если это не копия AutoFlash. */
  importJson(json: string): boolean;
  resetAll(): void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Актуальные данные для функций, которые должны вернуть результат сразу (а не после ререндера).
  const dataRef = useRef<AppData>(EMPTY_DATA);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setData(sanitizeData(JSON.parse(raw)));
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  // Сохраняем с задержкой, чтобы пачка изменений не писалась на диск много раз.
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => undefined);
    }, 400);
  }, [data, loaded]);

  // Раз в день в настольном приложении пишем копию в «Документы\AutoFlash\Backups».
  useEffect(() => {
    if (!loaded) return;
    const bridge = desktopBridge();
    const today = new Date().toISOString().slice(0, 10);
    if (!bridge || data.settings.lastBackupDay === today) return;
    if (data.customers.length + data.vehicles.length + data.jobs.length === 0) return;
    bridge.backup
      .save(JSON.stringify({ app: "autoflash", version: 1, exportedAt: Date.now(), ...data }, null, 2))
      .then(() => setData((d) => ({ ...d, settings: { ...d.settings, lastBackupDay: today } })))
      .catch(() => undefined);
  }, [loaded, data]);

  const mutate = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);

  const store = useMemo<Store>(
    () => ({
      loaded,
      data,
      addCustomer(c) {
        const customer: Customer = { id: newId(), createdAt: Date.now(), ...c };
        mutate((d) => ({ ...d, customers: [customer, ...d.customers] }));
        return customer;
      },
      updateCustomer(id, patch) {
        mutate((d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
      },
      removeCustomer(id) {
        mutate((d) => ({
          ...d,
          customers: d.customers.filter((c) => c.id !== id),
          vehicles: d.vehicles.map((v) => (v.customerId === id ? { ...v, customerId: null } : v)),
          jobs: d.jobs.map((j) => (j.customerId === id ? { ...j, customerId: null } : j)),
        }));
      },
      saveScan(scan, customerId = null) {
        const d = dataRef.current;
        const existing = scan.vin ? d.vehicles.find((v) => v.vin === scan.vin) : undefined;
        let result: VehicleRec;
        let next: AppData;
        if (existing) {
          result = { ...existing, customerId: customerId ?? existing.customerId, scans: [...existing.scans, scan].slice(-MAX_SCANS_PER_VEHICLE) };
          next = { ...d, vehicles: d.vehicles.map((v) => (v.id === existing.id ? result : v)) };
        } else {
          result = { id: newId(), customerId, vin: scan.vin ?? "", title: vehicleTitle(scan), plate: "", createdAt: Date.now(), scans: [scan] };
          next = { ...d, vehicles: [result, ...d.vehicles] };
        }
        dataRef.current = next;
        setData(next);
        return result;
      },
      updateVehicle(id, patch) {
        mutate((d) => ({ ...d, vehicles: d.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
      },
      addJob(j) {
        const now = Date.now();
        const job: Job = {
          id: newId(), vehicleId: null, customerId: null, status: "new", priceKzt: 0, paidKzt: 0, notes: "",
          createdAt: now, updatedAt: now, log: [{ t: now, text: "Заказ создан" }], ...j,
        };
        mutate((d) => ({ ...d, jobs: [job, ...d.jobs] }));
        return job;
      },
      updateJob(id, patch) {
        mutate((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === id ? { ...j, ...patch, updatedAt: Date.now() } : j)) }));
      },
      logJob(id, text) {
        mutate((d) => ({
          ...d,
          jobs: d.jobs.map((j) => (j.id === id ? { ...j, updatedAt: Date.now(), log: [...j.log, { t: Date.now(), text }] } : j)),
        }));
      },
      removeJob(id) {
        mutate((d) => ({ ...d, jobs: d.jobs.filter((j) => j.id !== id) }));
      },
      setCatalogJson(json) {
        mutate((d) => ({ ...d, catalogJson: json }));
      },
      updateSettings(patch) {
        mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
      },
      exportJson() {
        return JSON.stringify({ app: "autoflash", version: 1, exportedAt: Date.now(), ...dataRef.current }, null, 2);
      },
      importJson(json) {
        try {
          const raw = JSON.parse(json) as Record<string, unknown>;
          if (raw?.app !== "autoflash" && !Array.isArray(raw?.customers)) return false;
          const next = sanitizeData(raw);
          dataRef.current = next;
          setData(next);
          return true;
        } catch {
          return false;
        }
      },
      resetAll() {
        setData(EMPTY_DATA);
      },
    }),
    [data, loaded, mutate],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider отсутствует");
  return s;
}
