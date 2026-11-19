import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Elm327 } from "./core/elm327";
import { DEMO_CATALOG, parseCatalog, type CatalogItem } from "./core/catalog";
import { scanVehicle, type VehicleScan } from "./core/scanner";
import { SimulatedAdapter } from "./core/sim/simulator";
import { DEMO_VEHICLES } from "./core/sim/vehicles";
import type { Transport } from "./core/transport";
import { useStore } from "./storage/store";

export type ConnectionState =
  | { status: "idle" }
  | { status: "connecting"; label: string }
  | { status: "ready"; label: string; kind: Transport["kind"] }
  | { status: "error"; message: string };

type Session = {
  connection: ConnectionState;
  elm: Elm327 | null;
  scan: VehicleScan | null;
  scanning: boolean;
  progress: { step: string; fraction: number } | null;
  scanError: string | null;
  catalog: CatalogItem[];
  connect(transport: Transport): Promise<boolean>;
  connectDemo(index: number): Promise<boolean>;
  disconnect(): Promise<void>;
  runScan(): Promise<VehicleScan | null>;
  /** Журнал обмена с адаптером для экрана «Журнал». */
  exchangeLog(): Elm327["log"];
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [connection, setConnection] = useState<ConnectionState>({ status: "idle" });
  const [scan, setScan] = useState<VehicleScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<Session["progress"]>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const elmRef = useRef<Elm327 | null>(null);
  const [, force] = useState(0);

  const catalog = useMemo(() => [...DEMO_CATALOG, ...parseCatalog(store.data.catalogJson)], [store.data.catalogJson]);

  const disconnect = useCallback(async () => {
    const elm = elmRef.current;
    elmRef.current = null;
    setConnection({ status: "idle" });
    force((n) => n + 1);
    await elm?.close().catch(() => undefined);
  }, []);

  const connect = useCallback(
    async (transport: Transport) => {
      await disconnect();
      setConnection({ status: "connecting", label: transport.label });
      setScanError(null);
      const elm = new Elm327(transport);
      try {
        await elm.open();
        transport.onClose(() => {
          if (elmRef.current === elm) {
            elmRef.current = null;
            setConnection({ status: "error", message: "Соединение с адаптером оборвалось" });
            force((n) => n + 1);
          }
        });
        elmRef.current = elm;
        setConnection({ status: "ready", label: transport.label, kind: transport.kind });
        force((n) => n + 1);
        return true;
      } catch (e) {
        await elm.close().catch(() => undefined);
        setConnection({ status: "error", message: e instanceof Error ? e.message : "Не удалось подключиться" });
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
      const result = await scanVehicle(elm, { onProgress: (step, fraction) => setProgress({ step, fraction }) });
      setScan(result);
      store.saveScan(result);
      return result;
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Не удалось просканировать авто");
      return null;
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }, [store]);

  const value: Session = {
    connection,
    elm: elmRef.current,
    scan,
    scanning,
    progress,
    scanError,
    catalog,
    connect,
    connectDemo,
    disconnect,
    runScan,
    exchangeLog: () => elmRef.current?.log ?? [],
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("SessionProvider отсутствует");
  return s;
}
