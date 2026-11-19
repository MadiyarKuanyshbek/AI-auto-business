import type { Transport } from "../core/transport";

/** В браузере нет сырых TCP-сокетов, поэтому Wi-Fi адаптеры работают только в мобильном приложении. */
export const wifiSupported = false;

export function createWifiTransport(_host: string, _port: number): Transport {
  throw new Error("Wi-Fi адаптеры работают только в мобильном приложении (в браузере нет TCP-сокетов).");
}
