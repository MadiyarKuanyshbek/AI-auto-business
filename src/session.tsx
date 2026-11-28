import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parseCodingPackage, type CodingPackage } from "./core/coding";
import { Elm327 } from "./core/elm327";
import { parsePackage, type FirmwarePackage } from "./core/package";
import { deepScan, scanVehicle, type VehicleScan } from "./core/scanner";
import { DEMO_CODING_DSG } from "./core/sim/demoCoding";
import { DEMO_PACKAGES } from "./core/sim/demoPackage";
import { SimulatedAdapter } from "./core/sim/simulator";
import { DEMO_VEHICLES } from "./core/sim/vehicles";
import type { Transport } from "./core/transport";
import { useStore } from "./storage/store";

export type ConnectionState =
  | { status: "idle" }
  | { status: "connecting"; label: string }
  | { status: "ready"; label: string; kind: Transport["kind"] }
  | { status: "error"; message: string };

export type LoadedPackage = { pkg: FirmwarePackage; segments: { address: number; data: Uint8Array }[] };

type Session = {
  connection: ConnectionState;
  elm: Elm327 | null;
  /** Сканирование, которое показываем в приложении: текущее или последнее сохранённое. */
  scan: VehicleScan | null;
  /** Сканирование текущего подключения (пусто, пока не подключены или идёт определение). */
  liveScan: VehicleScan | null;
  scanning: boolean;
  progress: { step: string; fraction: number } | null;
  scanError: string | null;
  /** Пакеты прошивки из библиотеки (загруженные + демо, если включены). */
  packages: LoadedPackage[];
  /** Пакеты кодирования (настройки блоков) из библиотеки. */
  codingPackages: CodingPackage[];
  connect(transport: Transport): Promise<boolean>;
  connectDemo(index: number): Promise<boolean>;
  disconnect(): Promise<void>;
  runScan(): Promise<VehicleScan | null>;
  /** Глубокий поиск блоков по всем адресам; возвращает число найденных новых блоков. */
  runDeepScan(): Promise<number>;
  /** Журнал обмена с адаптером. */
  exchangeLog(): Elm327["log"];
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [connection, setConnection] = useState<ConnectionState>({ status: "idle" });
  const [scan, setScan] = useState<VehicleScan | null>(null);
  const [liveScan, setLiveScan] = useState<VehicleScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<Session["progress"]>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const elmRef = useRef<Elm327 | null>(null);
  const kindRef = useRef<Transport["kind"] | null>(null);
  const runScanRef = useRef<() => Promise<VehicleScan | null>>(async () => null);
  const connectSeq = useRef(0); // номер последней попытки подключения: старые попытки отменяются
  const [elmState, setElmState] = useState<Elm327 | null>(null);

  // После перезапуска показываем последнее сохранённое сканирование (без подключения к авто).
  const latestStored = useMemo(
    () => store.data.vehicles.flatMap((v) => v.scans).sort((a, b) => b.scannedAt - a.scannedAt)[0] ?? null,
    [store.data.vehicles],
  );

  const showDemo = store.data.settings.showDemo;
  const packages = useMemo<LoadedPackage[]>(() => {
    const raw: unknown[] = [...(showDemo ? DEMO_PACKAGES : []), ...store.data.packages];
    const out: LoadedPackage[] = [];
    for (const item of raw) {
      const parsed = parsePackage(item);
      if (parsed.ok) out.push({ pkg: parsed.pkg, segments: parsed.segments });
    }
    return out;
  }, [showDemo, store.data.packages]);

  const codingPackages = useMemo<CodingPackage[]>(() => {
    const raw: unknown[] = [...(showDemo ? [DEMO_CODING_DSG] : []), ...store.data.packages];
    const out: CodingPackage[] = [];
    for (const item of raw) {
      const parsed = parseCodingPackage(item);
      if (parsed.ok) out.push(parsed.pkg);
    }
    return out;
  }, [showDemo, store.data.packages]);

  const disconnect = useCallback(async () => {
    connectSeq.current++;
    const elm = elmRef.current;
    elmRef.current = null;
    setElmState(null);
    setLiveScan(null);
    setConnection({ status: "idle" });
    await elm?.close().catch(() => undefined);
  }, []);

  const connect = useCallback(
    async (transport: Transport) => {
      await disconnect();
      const seq = ++connectSeq.current;
      setConnection({ status: "connecting", label: transport.label });
      setScanError(null);
      const elm = new Elm327(transport);
      try {
        await elm.open();
        if (seq !== connectSeq.current) {
          // Пока открывали канал, пользователь запустил другое подключение: этот канал закрываем.
          await elm.close().catch(() => undefined);
          return false;
        }
        transport.onClose(() => {
          if (elmRef.current === elm) {
            elmRef.current = null;
            setElmState(null);
            setLiveScan(null);
            setConnection({ status: "error", message: "Соединение с адаптером оборвалось" });
          }
        });
        elmRef.current = elm;
        kindRef.current = transport.kind;
        setElmState(elm);
        setConnection({ status: "ready", label: transport.label, kind: transport.kind });
        // Сразу определяем автомобиль: пользователю не нужно ничего нажимать.
        void runScanRef.current();
        return true;
      } catch (e) {
        await elm.close().catch(() => undefined);
        if (seq === connectSeq.current) setConnection({ status: "error", message: e instanceof Error ? e.message : "Не удалось подключиться" });
        return false;
      }
    },
    [disconnect],
  );

  const connectDemo = useCallback(
    (index: number) => connect(new SimulatedAdapter(structuredClone(DEMO_VEHICLES[index % DEMO_VEHICLES.length]))),
    [connect],
  );

  const runScan = useCallback(async () => {
    const elm = elmRef.current;
    if (!elm) return null;
    setScanning(true);
    setScanError(null);
    setProgress({ step: "Подготовка", fraction: 0 });
    try {
      const result = await scanVehicle(elm, { online: store.data.settings.onlineVin !== false, onProgress: (step, fraction) => setProgress({ step, fraction }) });
      if (elmRef.current !== elm) return null; // отключились во время определения: старый результат не показываем
      setScan(result);
      setLiveScan(result);
      store.saveScan(result);
      // Первый скан настоящего авто: демо-режим и демо-позиции больше не нужны — прячем.
      if (kindRef.current !== "demo" && !store.data.settings.hadRealScan) {
        store.updateSettings({ hadRealScan: true, showDemo: false });
      }
      return result;
    } catch (e) {
      if (elmRef.current === elm) setScanError(e instanceof Error ? e.message : "Не удалось просканировать авто");
      return null;
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }, [store]);
  useEffect(() => {
    runScanRef.current = runScan;
  }, [runScan]);

  const runDeepScan = useCallback(async () => {
    const elm = elmRef.current;
    const base = liveScan;
    if (!elm || !base) return 0;
    setScanning(true);
    setScanError(null);
    try {
      const extra = await deepScan(elm, base.ecus, (step, fraction) => setProgress({ step, fraction }));
      if (elmRef.current !== elm) return 0;
      if (extra.length > 0) {
        const merged: VehicleScan = { ...base, ecus: [...base.ecus, ...extra], scannedAt: Date.now() };
        setScan(merged);
        setLiveScan(merged);
        store.saveScan(merged);
      }
      return extra.length;
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Не удалось выполнить глубокий поиск");
      return 0;
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }, [liveScan, store]);

  const value: Session = {
    connection,
    elm: elmState,
    scan: scan ?? latestStored,
    liveScan,
    scanning,
    progress,
    scanError,
    packages,
    codingPackages,
    connect,
    connectDemo,
    disconnect,
    runScan,
    runDeepScan,
    exchangeLog: () => elmRef.current?.log ?? [],
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("SessionProvider отсутствует");
  return s;
}
