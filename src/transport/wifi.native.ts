import TcpSocket from "react-native-tcp-socket";
import type { Transport } from "../core/transport";

export const wifiSupported = true;

/** Wi-Fi ELM327 (обычно 192.168.0.10:35000): телефон должен быть подключён к сети адаптера. */
export function createWifiTransport(host: string, port: number): Transport {
  let socket: ReturnType<typeof TcpSocket.createConnection> | null = null;
  const data = new Set<(c: string) => void>();
  const close = new Set<() => void>();

  return {
    kind: "wifi",
    label: `Wi-Fi ${host}:${port}`,
    connect: () =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            socket?.destroy();
            reject(new Error("Адаптер не отвечает. Подключите телефон к Wi-Fi сети адаптера и проверьте адрес."));
          }
        }, 8000);
        socket = TcpSocket.createConnection({ host, port, connectTimeout: 7000 }, () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve();
          }
        });
        socket.on("data", (chunk: unknown) => {
          const text = typeof chunk === "string" ? chunk : String.fromCharCode(...Array.from(chunk as ArrayLike<number>));
          data.forEach((l) => l(text));
        });
        socket.on("error", (err: Error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error(`Не удалось подключиться: ${err.message}`));
          }
        });
        socket.on("close", () => close.forEach((l) => l()));
      }),
    disconnect: async () => {
      socket?.destroy();
      socket = null;
    },
    write: (text: string) =>
      new Promise<void>((resolve, reject) => {
        if (!socket) return reject(new Error("Нет соединения"));
        socket.write(text, "ascii", (err?: Error) => (err ? reject(err) : resolve()));
      }),
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
