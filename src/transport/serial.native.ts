import type { Transport } from "../core/transport";

// На телефоне COM-портов нет: адаптеры подключаются по Bluetooth LE или Wi-Fi.
export const serialSupported = false;

export async function pickSerialTransport(): Promise<Transport> {
  throw new Error("COM-порты доступны только на компьютере.");
}
