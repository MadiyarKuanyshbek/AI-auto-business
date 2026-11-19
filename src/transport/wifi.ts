import type { Transport } from "../core/transport";
import { desktopBridge } from "./desktop";

/** В обычном браузере нет TCP-сокетов; в настольном приложении они есть через мост Electron. */
export const wifiSupported = desktopBridge() !== null;

export function createWifiTransport(host: string, port: number): Transport {
  const bridge = desktopBridge();
  if (!bridge) throw new Error("Wi-Fi адаптеры работают в мобильном и настольном приложении (в браузере нет TCP-сокетов).");

  const data = new Set<(c: string) => void>();
  const close = new Set<() => void>();
  let id: number | null = null;
  let offData: (() => void) | null = null;
  let offClose: (() => void) | null = null;

  return {
    kind: "wifi",
    label: `Wi-Fi ${host}:${port}`,
    async connect() {
      const socketId = await bridge.tcp.connect(host, port);
      id = socketId;
      offData = bridge.tcp.onData((sid, text) => {
        if (sid === socketId) data.forEach((l) => l(text));
      });
      offClose = bridge.tcp.onClose((sid) => {
        if (sid === socketId) close.forEach((l) => l());
      });
    },
    async disconnect() {
      offData?.();
      offClose?.();
      if (id !== null) bridge.tcp.close(id);
      id = null;
    },
    async write(text) {
      if (id === null) throw new Error("Нет соединения");
      await bridge.tcp.write(id, text);
    },
    onData: (l) => {
      data.add(l);
      return () => data.delete(l);
    },
    onClose: (l) => {
      close.add(l);
      return () => close.delete(l);
    },
  };
}
