import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { VehicleScan } from "../core/scanner";
import { desktopBridge } from "../transport/desktop";
import { parsePackage } from "../core/package";
import { EMPTY_DATA, newId, sanitizeData, vehicleTitle, type AppData, type CarMedia, type InstallRecord, type QueueItem, type Settings, type VehicleRec } from "./model";

const KEY = "autoflash.v1";
const MAX_SCANS_PER_VEHICLE = 5;

type Store = {
  loaded: boolean;
  data: AppData;
  /** Текст ошибки, если данные не удалось сохранить (например, закончилось место). */
  saveError: string | null;
  /** Сохраняет результат сканирования: находит авто по VIN или создаёт карточку. */
  saveScan(scan: VehicleScan): VehicleRec;
  updateSettings(patch: Partial<Settings>): void;
  /** Добавляет пакет прошивки в библиотеку после проверки формата и контрольных сумм. */
  addPackage(json: unknown): { ok: true; title: string } | { ok: false; error: string };
  removePackage(id: string, version: string): void;
  addInstall(rec: InstallRecord): void;
  addMedia(carId: string, media: Omit<CarMedia, "id">): void;
  removeMedia(carId: string, mediaId: string): void;
  enqueue(item: Omit<QueueItem, "id" | "at">): void;
  dequeue(id: string): void;
  /** Полная копия данных в виде JSON-текста (для переноса на другой компьютер). */
  exportJson(): string;
  /** Заменяет все данные содержимым копии. Возвращает false, если это не копия AutoFlash. */
  importJson(json: string): boolean;
  resetAll(): void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Актуальные данные для функций, которые должны вернуть результат сразу (а не после ререндера).
  const dataRef = useRef<AppData>(EMPTY_DATA);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(async (raw) => {
        if (!raw) return;
        try {
          setData(sanitizeData(JSON.parse(raw)));
        } catch {
          // Данные повреждены: сохраняем копию, прежде чем новые данные её затрут.
          await AsyncStorage.setItem(`${KEY}.corrupt`, raw).catch(() => undefined);
          setSaveError("Сохранённые данные оказались повреждены. Копия сохранена отдельно, приложение начато с чистого листа.");
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  // Сохраняем с задержкой, чтобы пачка изменений не писалась на диск много раз.
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(data))
        .then(() => setSaveError(null))
        .catch(() => setSaveError("Не удалось сохранить данные: возможно, закончилось место. Удалите лишние фото салонов или пакеты."));
    }, 400);
  }, [data, loaded]);

  // Раз в день в настольном приложении пишем копию в «Документы\AutoFlash\Backups».
  useEffect(() => {
    if (!loaded) return;
    const bridge = desktopBridge();
    const today = new Date().toISOString().slice(0, 10);
    if (!bridge || data.settings.lastBackupDay === today) return;
    if (data.vehicles.length + data.packages.length + data.installs.length === 0) return;
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
      saveError,
      saveScan(scan) {
        const d = dataRef.current;
        const existing = scan.vin ? d.vehicles.find((v) => v.vin === scan.vin) : undefined;
        let result: VehicleRec;
        let next: AppData;
        if (existing) {
          result = { ...existing, scans: [...existing.scans, scan].slice(-MAX_SCANS_PER_VEHICLE) };
          next = { ...d, vehicles: d.vehicles.map((v) => (v.id === existing.id ? result : v)) };
        } else {
          result = { id: newId(), vin: scan.vin ?? "", title: vehicleTitle(scan), createdAt: Date.now(), scans: [scan] };
          next = { ...d, vehicles: [result, ...d.vehicles] };
        }
        dataRef.current = next;
        setData(next);
        return result;
      },
      addPackage(json) {
        const parsed = parsePackage(json);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        const { id, version } = parsed.pkg;
        const rest = dataRef.current.packages.filter((p) => {
          const q = p as { id?: string; version?: string };
          return !(q.id === id && q.version === version);
        });
        const next = { ...dataRef.current, packages: [...rest, json] };
        dataRef.current = next;
        setData(next);
        return { ok: true, title: `${parsed.pkg.title} v${version}` };
      },
      removePackage(id, version) {
        mutate((d) => ({
          ...d,
          packages: d.packages.filter((p) => {
            const q = p as { id?: string; version?: string };
            return !(q.id === id && q.version === version);
          }),
        }));
      },
      addInstall(rec) {
        mutate((d) => ({ ...d, installs: [...d.installs, rec] }));
      },
      addMedia(carId, media) {
        mutate((d) => ({ ...d, media: { ...d.media, [carId]: [...(d.media[carId] ?? []), { id: newId(), ...media }] } }));
      },
      removeMedia(carId, mediaId) {
        mutate((d) => ({ ...d, media: { ...d.media, [carId]: (d.media[carId] ?? []).filter((m) => m.id !== mediaId) } }));
      },
      enqueue(item) {
        mutate((d) => (d.queue.some((q) => q.carId === item.carId && q.fileName === item.fileName) ? d : { ...d, queue: [...d.queue, { id: newId(), at: Date.now(), ...item }] }));
      },
      dequeue(id) {
        mutate((d) => ({ ...d, queue: d.queue.filter((q) => q.id !== id) }));
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
          if (raw?.app !== "autoflash") return false;
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
    [data, loaded, saveError, mutate],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider отсутствует");
  return s;
}
