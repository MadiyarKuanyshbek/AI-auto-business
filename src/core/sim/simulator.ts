import type { Transport } from "../transport";
import { asciiToBytes, bytesToHex } from "../hex";

/** Виртуальный блок управления внутри симулятора. */
export type SimEcu = {
  name: string;
  txId: string; // на какой CAN-ID слушает запросы, например "7E0"
  rxId: string; // с какого CAN-ID отвечает, например "7E8"
  /** Отвечает ли на запросы OBD-II (режимы 01/03/04/07/09/0A). */
  obd?: boolean;
  /** UDS DID → значение (ASCII-строка или байты). */
  dids?: Record<number, string | number[]>;
  dtcs?: string[]; // "P0171"
  /** Задержка ответа в мс (для проверки таймаутов). */
  delayMs?: number;
};

export type SimVehicle = {
  label: string;
  vin: string;
  voltage: number;
  /** Текущие данные режима 01: PID → сырые байты. */
  pids: Record<number, number[]>;
  calibrationIds: string[];
  cvn: string[]; // hex по 4 байта
  ecuName: string;
  ecus: SimEcu[];
};

function dtcToBytes(code: string): [number, number] {
  const kind = "PCBU".indexOf(code[0]);
  const digit1 = parseInt(code[1], 16);
  return [(kind << 6) | (digit1 << 4) | parseInt(code[2], 16), parseInt(code.slice(3), 16)];
}

function padAscii(text: string, len: number): number[] {
  const b = asciiToBytes(text).slice(0, len);
  while (b.length < len) b.push(0);
  return b;
}

/** Строит кадры ISO-TP, как их печатает ELM327 при ATH1. */
function isoTpLines(rxId: string, payload: number[]): string[] {
  if (payload.length <= 7) {
    const f = [payload.length, ...payload];
    while (f.length < 8) f.push(0);
    return [`${rxId} ${bytesToHex(f)}`];
  }
  const lines: string[] = [];
  const first = [0x10 | (payload.length >> 8), payload.length & 0xff, ...payload.slice(0, 6)];
  lines.push(`${rxId} ${bytesToHex(first)}`);
  let seq = 1;
  for (let i = 6; i < payload.length; i += 7) {
    const chunk = payload.slice(i, i + 7);
    const f = [0x20 | (seq & 0x0f), ...chunk];
    while (f.length < 8) f.push(0);
    lines.push(`${rxId} ${bytesToHex(f)}`);
    seq++;
  }
  return lines;
}

function supportedMask(base: number, supported: number[]): number[] {
  let mask = 0;
  for (const pid of supported) {
    if (pid > base && pid <= base + 0x20) mask |= 1 << (32 - (pid - base));
  }
  // бит 0x20 (последний) — "есть следующая группа"
  if (supported.some((p) => p > base + 0x20)) mask |= 1;
  return [(mask >>> 24) & 0xff, (mask >>> 16) & 0xff, (mask >>> 8) & 0xff, mask & 0xff];
}

/**
 * Программный ELM327 + автомобиль. Используется в демо-режиме приложения и в
 * автотестах: ядро общается с ним теми же байтами, что и с настоящим адаптером.
 */
export class SimulatedAdapter implements Transport {
  readonly kind = "demo" as const;
  readonly label: string;
  private listeners = new Set<(chunk: string) => void>();
  private closeListeners = new Set<() => void>();
  private connected = false;
  private header = "7DF";
  private rxFilter: string | null = null;
  private echo = true;
  /** Команды, по которым симулятор "не отвечает" — для тестов таймаутов. */
  mute = new Set<string>();
  readonly sent: string[] = [];

  constructor(readonly vehicle: SimVehicle) {
    this.label = `Демо: ${vehicle.label}`;
  }

  async connect() {
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
    this.closeListeners.forEach((l) => l());
  }
  onData(listener: (chunk: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onClose(listener: () => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  async write(data: string) {
    if (!this.connected) throw new Error("not connected");
    for (const cmd of data.split("\r").map((c) => c.trim()).filter(Boolean)) {
      this.sent.push(cmd);
      if (this.mute.has(cmd.toUpperCase())) continue;
      const { text, delayMs } = this.handle(cmd);
      const emit = () => this.listeners.forEach((l) => l(text));
      // Без задержки — микрозадача: setTimeout(0) на Windows даёт ~15 мс на команду.
      if (delayMs > 0) setTimeout(emit, delayMs);
      else queueMicrotask(emit);
    }
  }

  private out(cmd: string, lines: string[], delayMs = 0) {
    const echo = this.echo ? `${cmd}\r` : "";
    return { text: `${echo}${lines.join("\r")}${lines.length ? "\r" : ""}\r>`, delayMs };
  }

  private handle(cmd: string): { text: string; delayMs: number } {
    const upper = cmd.toUpperCase().replace(/\s+/g, "");

    if (upper.startsWith("AT")) return this.handleAt(cmd, upper);
    if (!/^[0-9A-F]+$/.test(upper) || upper.length % 2) return this.out(cmd, ["?"]);

    const request = [] as number[];
    for (let i = 0; i < upper.length; i += 2) request.push(parseInt(upper.slice(i, i + 2), 16));

    const targets = this.vehicle.ecus.filter((e) =>
      this.header === "7DF" ? e.obd : e.txId === this.header,
    );
    const lines: string[] = [];
    let delay = 0;
    for (const ecu of targets) {
      if (this.rxFilter && this.rxFilter !== ecu.rxId) continue;
      const payload = this.respond(ecu, request);
      if (payload) {
        lines.push(...isoTpLines(ecu.rxId, payload));
        delay = Math.max(delay, ecu.delayMs ?? 0);
      }
    }
    return this.out(cmd, lines.length ? lines : ["NO DATA"], delay);
  }

  private handleAt(cmd: string, upper: string) {
    const ok = this.out(cmd, ["OK"]);
    if (upper === "ATZ") {
      this.header = "7DF";
      this.rxFilter = null;
      this.echo = true;
      return this.out(cmd, ["", "ELM327 v1.5"], 30);
    }
    if (upper === "ATE0") {
      this.echo = false;
      return { text: "OK\r\r>", delayMs: 0 };
    }
    if (upper === "ATE1") {
      this.echo = true;
      return ok;
    }
    if (upper === "ATI") return this.out(cmd, ["ELM327 v1.5 (simulated)"]);
    if (upper === "ATRV") return this.out(cmd, [`${this.vehicle.voltage.toFixed(1)}V`]);
    if (upper === "ATDP") return this.out(cmd, ["ISO 15765-4 (CAN 11/500)"]);
    if (upper === "ATDPN") return this.out(cmd, ["A6"]);
    if (upper.startsWith("ATSH")) {
      this.header = upper.slice(4).padStart(3, "0");
      return ok;
    }
    if (upper.startsWith("ATCRA")) {
      this.rxFilter = upper.slice(5) || null;
      return ok;
    }
    if (upper === "ATAR") {
      this.rxFilter = null;
      return ok;
    }
    return ok; // L0, S1, H1, CAF1, ST xx, SP0 …
  }

  /** Ответ блока на запрос (без CAN-обвязки). null — блок промолчал. */
  private respond(ecu: SimEcu, req: number[]): number[] | null {
    const v = this.vehicle;
    const [service, a] = req;

    if (service === 0x01 && ecu.obd) {
      if (a % 0x20 === 0) {
        return [0x41, a, ...supportedMask(a, Object.keys(v.pids).map(Number).concat([0x00, 0x20, 0x40].filter((p) => p > a)))];
      }
      const data = v.pids[a];
      return data ? [0x41, a, ...data] : null;
    }

    if ((service === 0x03 || service === 0x07 || service === 0x0a) && ecu.obd) {
      const dtcs = service === 0x03 ? (ecu.dtcs ?? []) : [];
      return [service + 0x40, dtcs.length, ...dtcs.flatMap(dtcToBytes)];
    }

    if (service === 0x04 && ecu.obd) {
      ecu.dtcs = [];
      return [0x44];
    }

    if (service === 0x09 && ecu.obd) {
      if (a === 0x00) return [0x49, 0x00, 0x54, 0x40, 0x00, 0x00]; // 02, 04, 06, 0A
      if (a === 0x02) return [0x49, 0x02, 0x01, ...asciiToBytes(v.vin)];
      if (a === 0x04) return [0x49, 0x04, v.calibrationIds.length, ...v.calibrationIds.flatMap((c) => padAscii(c, 16))];
      if (a === 0x06) {
        const bytes = v.cvn.flatMap((c) => [0, 2, 4, 6].map((i) => parseInt(c.slice(i, i + 2), 16)));
        return [0x49, 0x06, v.cvn.length, ...bytes];
      }
      if (a === 0x0a) return [0x49, 0x0a, 0x01, ...padAscii(v.ecuName, 20)];
      return null;
    }

    if (service === 0x22) {
      const did = (req[1] << 8) | req[2];
      const value = ecu.dids?.[did];
      if (value === undefined) return [0x7f, 0x22, 0x31];
      const bytes = typeof value === "string" ? asciiToBytes(value) : value;
      return [0x62, req[1], req[2], ...bytes];
    }

    if (service === 0x3e) return [0x7e, 0x00];
    // Неизвестная служба: блок есть, но отказывает.
    return [0x7f, service, 0x11];
  }
}
