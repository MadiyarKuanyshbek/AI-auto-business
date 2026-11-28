import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { codingFitsEcu, parseCodingPackage, readCoding, type CodingPackage } from "./core/coding";
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
  /** Название операции, которая сейчас занимает адаптер (пусто, если адаптер свободен). */
  busy: string | null;
  /**
   * Выполняет операцию с адаптером строго по очереди: определение автомобиля, прошивка, кодирование и чтение данных
   * не могут идти одновременно и сбить друг другу адрес блока.
   */
  exclusive<T>(label: string, fn: () => Promise<T>): Promise<T>;
  /** Свободен ли адаптер прямо сейчас (для фонового опроса, который не должен мешать). */
  isIdle(): boolean;
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
  const labelRef = useRef("");
  const codingRef = useRef<CodingPackage[]>([]);
  const runScanRef = useRef<() => Promise<VehicleScan | null>>(async () => null);
  const lockQueue = useRef<Promise<unknown>>(Promise.resolve());
  const busyCount = useRef(0);
  const [busy, setBusy] = useState<string | null>(null);
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

  useEffect(() => {
    codingRef.current = codingPackages;
  }, [codingPackages]);

  const exclusive = useCallback(<T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    busyCount.current++;
    const run = async () => {
      setBusy(label);
      try {
        return await fn();
      } finally {
        busyCount.current--;
        if (busyCount.current === 0) setBusy(null);
      }
    };
    const p = lockQueue.current.then(run, run);
    lockQueue.current = p.catch(() => undefined);
    return p;
  }, []);
  const isIdle = useCallback(() => busyCount.current === 0, []);

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
        labelRef.current = transport.label;
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

  /**
   * Сразу после определения автомобиля запоминаем его настройки для будущей работы: способ подключения, адаптер и значения
   * настроек блоков по подходящим пакетам кодирования. Ошибки чтения здесь не мешают: снимок просто будет неполным.
   */
  const takeSnapshot = useCallback(
    async (elm: Elm327, result: VehicleScan) => {
      if (!result.vin) return;
      const coding: NonNullable<Parameters<typeof store.saveSnapshot>[1]>["coding"] = [];
      for (const pkg of codingRef.current) {
        for (const ecu of result.ecus) {
          if (!codingFitsEcu(pkg, ecu)) continue;
          try {
            if (elmRef.current !== elm) return;
            coding.push({ pkgId: pkg.id, pkgTitle: pkg.title, ecuName: ecu.name, txId: ecu.txId, did: pkg.target.did, value: await readCoding(elm, ecu, pkg) });
          } catch {
            // блок не отдал настройки: пропускаем
          }
        }
      }
      store.saveSnapshot(result.vin, {
        at: Date.now(),
        via: kindRef.current ?? "unknown",
        label: labelRef.current,
        adapter: { chip: result.adapter.chip, protocol: result.adapter.protocol, bus: result.adapter.bus, voltage: result.adapter.voltage },
        coding,
        dtcCount: result.dtcs.length,
      });
    },
    [store],
  );

  const runScanInner = useCallback(async () => {
    const elm = elmRef.current;
    if (!elm) return null;
    setScanning(true);
    setScanError(null);
    setProgress({ step: "Подготовка", fraction: 0 });
    try {
      const result = await scanVehicle(elm, { online: store.data.settings.onlineVin !== false, onProgress: (step, fraction) => setProgress({ step, fraction }) });
      if (elmRef.current !== elm) return null; // отключились во время определения: старый результат не показываем
      store.saveScan(result);
      // Снимок настроек снимается до того, как результат станет виден: пока адаптер занят этим, другие операции не стартуют.
      await takeSnapshot(elm, result);
      if (elmRef.current !== elm) return null;
      setScan(result);
      setLiveScan(result);
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
  }, [store, takeSnapshot]);
  const runScan = useCallback(() => exclusive("Определение автомобиля", runScanInner), [exclusive, runScanInner]);
  useEffect(() => {
    runScanRef.current = runScan;
  }, [runScan]);

  const runDeepScanInner = useCallback(async () => {
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
  const runDeepScan = useCallback(() => exclusive("Глубокий поиск блоков", runDeepScanInner), [exclusive, runDeepScanInner]);

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
    busy,
    exclusive,
    isIdle,
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
