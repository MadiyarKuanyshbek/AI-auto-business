import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, type Characteristic, type Device } from "react-native-ble-plx";
import type { Transport } from "../core/transport";
import { asciiToBytes, base64Decode, base64Encode } from "../core/hex";
import type { BleApi, BleDeviceInfo } from "./types";

let manager: BleManager | null = null;
const getManager = () => (manager ??= new BleManager());

async function ensurePermissions() {
  if (Platform.OS !== "android") return;
  const api = Number(Platform.Version);
  const wanted =
    api >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  if (!Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error("Нет разрешения на Bluetooth: включите его в настройках приложения.");
  }
}

// Частые службы BLE-адаптеров ELM327 (Vgate, OBDLink, Veepeak, vLinker…); иначе берём первую подходящую пару.
const KNOWN_SERVICES = ["fff0", "ffe0", "18f0", "e7810a71-73ae-499d-8c15-faa9aef0c3f2"];

function short(uuid: string) {
  const m = uuid.toLowerCase().match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);
  return m ? m[1] : uuid.toLowerCase();
}

function createBleTransport(info: BleDeviceInfo): Transport {
  const data = new Set<(c: string) => void>();
  const close = new Set<() => void>();
  let device: Device | null = null;
  let tx: Characteristic | null = null;
  let subs: { remove(): void }[] = [];

  return {
    kind: "ble",
    label: `Bluetooth ${info.name}`,
    async connect() {
      await ensurePermissions();
      const m = getManager();
      const connected = await m.connectToDevice(info.id, { timeout: 10000 });
      device = await connected.discoverAllServicesAndCharacteristics();
      subs.push(device.onDisconnected(() => close.forEach((l) => l())));

      let notify: Characteristic | null = null;
      const services = await device.services();
      const ordered = [...services].sort(
        (a, b) => Number(KNOWN_SERVICES.includes(short(b.uuid))) - Number(KNOWN_SERVICES.includes(short(a.uuid))),
      );
      for (const s of ordered) {
        for (const c of await s.characteristics()) {
          if (!notify && c.isNotifiable) notify = c;
          if (!tx && (c.isWritableWithoutResponse || c.isWritableWithResponse)) tx = c;
        }
        if (notify && tx) break;
      }
      if (!notify || !tx) throw new Error("У устройства нет подходящих BLE-характеристик (это не BLE OBD-адаптер?)");
      subs.push(
        notify.monitor((error, c) => {
          if (error || !c?.value) return;
          data.forEach((l) => l(String.fromCharCode(...base64Decode(c.value as string))));
        }),
      );
    },
    async disconnect() {
      subs.forEach((s) => s.remove());
      subs = [];
      await device?.cancelConnection().catch(() => undefined);
      device = null;
      tx = null;
    },
    async write(text) {
      if (!tx) throw new Error("Нет соединения");
      const bytes = asciiToBytes(text);
      // MTU BLE по умолчанию 23 → 20 байт полезной нагрузки.
      for (let i = 0; i < bytes.length; i += 20) {
        const chunk = base64Encode(bytes.slice(i, i + 20));
        if (tx.isWritableWithoutResponse) await tx.writeWithoutResponse(chunk);
        else await tx.writeWithResponse(chunk);
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

export const ble: BleApi = {
  supported: true,
  async startScan(onDevice, onError) {
    try {
      await ensurePermissions();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Нет разрешения");
      return () => undefined;
    }
    const m = getManager();
    const seen = new Set<string>();
    await m.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        onError(error.message);
        return;
      }
      if (device && !seen.has(device.id)) {
        seen.add(device.id);
        onDevice({ id: device.id, name: device.name ?? device.localName ?? "Без имени", rssi: device.rssi });
      }
    });
    return () => void m.stopDeviceScan();
  },
  connect: createBleTransport,
  async pick() {
    return null;
  },
};
