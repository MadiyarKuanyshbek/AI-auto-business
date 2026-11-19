import type { Transport } from "../core/transport";
import { asciiToBytes } from "../core/hex";
import type { BleApi } from "./types";

// Web Bluetooth (Chrome/Edge на Windows, macOS, Android). Safari и iOS не поддерживают.

type WebChar = {
  properties: { notify: boolean; write: boolean; writeWithoutResponse: boolean };
  startNotifications(): Promise<unknown>;
  addEventListener(type: string, listener: (e: { target: { value: DataView } }) => void): void;
  writeValueWithoutResponse?(v: BufferSource): Promise<void>;
  writeValue(v: BufferSource): Promise<void>;
};
type WebService = { getCharacteristics(): Promise<WebChar[]> };
type WebDevice = {
  name?: string;
  gatt: { connect(): Promise<{ getPrimaryServices(): Promise<WebService[]> }>; disconnect(): void };
  addEventListener(type: string, listener: () => void): void;
};

const OPTIONAL_SERVICES = [0xfff0, 0xffe0, 0xffe1, 0x18f0, "e7810a71-73ae-499d-8c15-faa9aef0c3f2"];

function transportFor(device: WebDevice): Transport {
  const data = new Set<(c: string) => void>();
  const close = new Set<() => void>();
  let tx: WebChar | null = null;
  device.addEventListener("gattserverdisconnected", () => close.forEach((l) => l()));

  return {
    kind: "webbluetooth",
    label: `Bluetooth ${device.name ?? "адаптер"}`,
    async connect() {
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      let notify: WebChar | null = null;
      for (const s of services) {
        for (const c of await s.getCharacteristics()) {
          if (!notify && c.properties.notify) notify = c;
          if (!tx && (c.properties.write || c.properties.writeWithoutResponse)) tx = c;
        }
        if (notify && tx) break;
      }
      if (!notify || !tx) throw new Error("У устройства нет подходящих BLE-характеристик (это не BLE OBD-адаптер?)");
      await notify.startNotifications();
      notify.addEventListener("characteristicvaluechanged", (e) => {
        const v = e.target.value;
        const text = String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
        data.forEach((l) => l(text));
      });
    },
    async disconnect() {
      device.gatt.disconnect();
    },
    async write(text) {
      if (!tx) throw new Error("Нет соединения");
      const bytes = Uint8Array.from(asciiToBytes(text));
      for (let i = 0; i < bytes.length; i += 20) {
        const chunk = bytes.slice(i, i + 20);
        if (tx.properties.writeWithoutResponse && tx.writeValueWithoutResponse) await tx.writeValueWithoutResponse(chunk);
        else await tx.writeValue(chunk);
      }
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

const nav = (globalThis as unknown as { navigator?: { bluetooth?: { requestDevice(o: unknown): Promise<WebDevice> } } }).navigator;

export const ble: BleApi = {
  supported: !!nav?.bluetooth,
  async startScan() {
    throw new Error("В браузере выбор устройства делается через системное окно");
  },
  connect() {
    throw new Error("В браузере используйте выбор устройства");
  },
  async pick() {
    if (!nav?.bluetooth) {
      throw new Error("Этот браузер не поддерживает Web Bluetooth. Откройте в Chrome или Edge либо используйте мобильное приложение.");
    }
    const device = await nav.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES });
    return transportFor(device);
  },
};
