import type { Transport } from "../core/transport";

export type BleDeviceInfo = { id: string; name: string; rssi: number | null };

export type BleApi = {
  /** Есть ли Bluetooth LE на этой платформе. */
  supported: boolean;
  /** Нативные платформы: сканирование со списком устройств. Возвращает функцию остановки. */
  startScan(onDevice: (d: BleDeviceInfo) => void, onError: (message: string) => void): Promise<() => void>;
  connect(device: BleDeviceInfo): Transport;
  /** Web Bluetooth: системное окно выбора устройства. На нативных платформах — null. */
  pick(): Promise<Transport | null>;
};
