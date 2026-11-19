import type { Transport } from "../transport";
import { asciiToBytes, bytesToHex } from "../hex";
import { sha256Hex } from "../sha256";

/** Виртуальный блок управления внутри симулятора. */
export type SimEcu = {
  name: string;
  txId: string; // на какой CAN-ID слушает запросы, например "7E0"
  rxId: string; // с какого CAN-ID отвечает, например "7E8"
  /** Отвечает ли на запросы OBD-II (режимы 01/03/04/07/09/0A). */
  obd?: boolean;
  /** UDS DID → значение (ASCII-строка или байты). */
  dids?: Record<number, string | number[]>;
  /** KWP2000 (K-Line): локальный идентификатор службы 0x1A → значение. */
  kwpIdent?: Record<number, string>;
  dtcs?: string[]; // "P0171"
  /** Задержка ответа в мс (для проверки таймаутов). */
  delayMs?: number;
  /** Виртуальный загрузчик блока: позволяет проверять установку прошивки (UDS 0x10/0x27/0x31/0x34/0x36/0x37/0x11/0x23). */
  flash?: {
    base: number;
    memory: Uint8Array;
    seedHex: string;
    maskHex: string;
    maxBlock: number;
    /** Основа номера ПО: после успешной прошивки блок показывает основа + "-" + первые 4 символа SHA-256 записанной области. */
    softwareBase?: string;
  };
};

export type SimVehicle = {
  label: string;
  /** Адаптер на чипе STN (умеет длинные сообщения STPX). */
  stn?: boolean;
  /** Шина: CAN 11 бит (по умолчанию), CAN 29 бит или K-Line (ISO 9141-2 / KWP2000). */
  bus?: "can11" | "can29" | "kline";
  /** Для K-Line: "iso9141" (кадры 48 6B, VIN в 4-байтовых кадрах) или "kwp" (кадры 8N F1). */
  klineKind?: "iso9141" | "kwp";
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

function hexToBytesLocal(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function checksum(bytes: number[]): number {
  return bytes.reduce((a, b) => (a + b) & 0xff, 0);
}

/** Кадры K-Line так, как их печатает ELM327 при ATH1. */
function kLineLines(kind: "iso9141" | "kwp", addr: string, payload: number[]): string[] {
  const src = parseInt(addr, 16);
  if (kind === "kwp") {
    const frame = [0x80 | payload.length, 0xf1, src, ...payload];
    return [bytesToHex([...frame, checksum(frame)])];
  }
  // ISO 9141-2: данные режима 09 идут кадрами по 4 байта с номером кадра; остальное — одним кадром.
  const mk = (data: number[]) => {
    const frame = [0x48, 0x6b, src, ...data];
    return bytesToHex([...frame, checksum(frame)]);
  };
  if (payload[0] === 0x49 && payload.length > 7) {
    const [svc, pid, , ...rest] = payload;
    const lines: string[] = [];
    for (let i = 0, n = 1; i < rest.length; i += 4, n++) lines.push(mk([svc, pid, n, ...rest.slice(i, i + 4)]));
    return lines;
  }
  return [mk(payload)];
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
  private priority = "18";
  private boot = new Map<SimEcu, { session: number; unlocked: boolean; seedOut: boolean; dl: { addr: number; len: number; seq: number; data: number[] } | null; written: boolean }>();
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
    if (upper === "STI") return this.out(cmd, this.vehicle.stn ? ["STN2120 v5.10.3 (simulated)"] : ["?"]);
    let hexPayload = upper;
    const stpx = upper.match(/^STPX(?:T:\d+,)?(?:H:[0-9A-F]+,)?D:([0-9A-F]+)$/);
    if (stpx) {
      if (!this.vehicle.stn) return this.out(cmd, ["?"]);
      hexPayload = stpx[1];
    }
    if (!/^[0-9A-F]+$/.test(hexPayload) || hexPayload.length % 2) return this.out(cmd, ["?"]);
    // Настоящий ELM327 не отправляет многокадровые запросы: только STPX на STN-адаптере.
    if (!stpx && hexPayload.length / 2 > 7) return this.out(cmd, ["?"]);

    const request = [] as number[];
    for (let i = 0; i < hexPayload.length; i += 2) request.push(parseInt(hexPayload.slice(i, i + 2), 16));

    const functional = this.header === "7DF" || this.header === "FUNC";
    const targets = this.vehicle.ecus.filter((e) => (functional ? e.obd : e.txId === this.header));
    const bus = this.vehicle.bus ?? "can11";
    const lines: string[] = [];
    let delay = 0;
    for (const ecu of targets) {
      if (this.rxFilter && bus !== "kline" && this.rxFilter !== ecu.rxId) continue;
      const payload = this.respond(ecu, request);
      if (payload) {
        if (bus === "kline") lines.push(...kLineLines(this.vehicle.klineKind ?? "kwp", ecu.txId, payload));
        else lines.push(...isoTpLines(ecu.rxId, payload));
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
    if (upper === "ATDPN") {
      const v = this.vehicle;
      return this.out(cmd, [v.bus === "can29" ? "A7" : v.bus === "kline" ? (v.klineKind === "iso9141" ? "A3" : "A5") : "A6"]);
    }
    if (upper.startsWith("ATCP")) {
      this.priority = upper.slice(4);
      return ok;
    }
    if (upper.startsWith("ATSH")) {
      const arg = upper.slice(4);
      if (this.vehicle.bus === "kline") {
        // "8110F1" (KWP: формат, получатель, источник) или "686AF1" (функциональный адрес)
        this.header = arg === "686AF1" ? "FUNC" : arg.slice(2, 4);
      } else if (this.vehicle.bus === "can29") {
        this.header = arg === "DB33F1" ? "FUNC" : `${this.priority}${arg}`;
      } else {
        this.header = arg.padStart(3, "0");
      }
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

  /** Виртуальный загрузчик блока: те же проверки порядка, что делает настоящий (сессия → доступ → стирание → загрузка). */
  private bootloader(ecu: SimEcu, req: number[]): number[] | null {
    const f = ecu.flash!;
    let st = this.boot.get(ecu);
    if (!st) {
      st = { session: 1, unlocked: false, seedOut: false, dl: null, written: false };
      this.boot.set(ecu, st);
    }
    const nrc = (svc: number, code: number) => [0x7f, svc, code];
    const [service, a, b, c] = req;

    if (service === 0x10) {
      st.session = a;
      if (a === 0x01) st.unlocked = false;
      return [0x50, a, 0x00, 0x32, 0x01, 0xf4];
    }
    if (service === 0x85) return [0xc5, a];
    if (service === 0x27) {
      if (a % 2 === 1) {
        if (st.session === 1) return nrc(0x27, 0x7e);
        st.seedOut = true;
        return [0x67, a, ...hexToBytesLocal(f.seedHex)];
      }
      if (!st.seedOut) return nrc(0x27, 0x24);
      const seed = hexToBytesLocal(f.seedHex);
      const mask = hexToBytesLocal(f.maskHex);
      const expected = seed.map((x, i) => ((x ^ mask[i % mask.length]) + 1) & 0xff);
      const key = req.slice(2);
      if (key.length !== expected.length || key.some((x, i) => x !== expected[i])) return nrc(0x27, 0x35);
      st.unlocked = true;
      return [0x67, a];
    }
    if (service === 0x23) {
      if (!st.unlocked) return nrc(0x23, 0x33);
      const lenBytes = a >> 4;
      const addrBytes = a & 0x0f;
      const addr = req.slice(2, 2 + addrBytes).reduce((x, y) => x * 256 + y, 0);
      const len = req.slice(2 + addrBytes, 2 + addrBytes + lenBytes).reduce((x, y) => x * 256 + y, 0);
      if (addr < f.base || addr + len > f.base + f.memory.length) return nrc(0x23, 0x31);
      return [0x63, ...f.memory.slice(addr - f.base, addr - f.base + len)];
    }
    if (service === 0x31 && a === 0x01) {
      const id = (b << 8) | c;
      if (id === 0xff00) {
        if (st.session !== 0x02 || !st.unlocked) return nrc(0x31, 0x33);
        f.memory.fill(0xff);
        return [0x71, 0x01, b, c, 0x00];
      }
      if (id === 0x0202) return [0x71, 0x01, b, c, 0x00];
      return nrc(0x31, 0x31);
    }
    if (service === 0x34) {
      if (st.session !== 0x02) return nrc(0x34, 0x7e);
      if (!st.unlocked) return nrc(0x34, 0x33);
      const fmt = req[2];
      const addrBytes = fmt & 0x0f;
      const lenBytes = fmt >> 4;
      const addr = req.slice(3, 3 + addrBytes).reduce((x, y) => x * 256 + y, 0);
      const len = req.slice(3 + addrBytes, 3 + addrBytes + lenBytes).reduce((x, y) => x * 256 + y, 0);
      if (addr < f.base || addr + len > f.base + f.memory.length) return nrc(0x34, 0x31);
      st.dl = { addr, len, seq: 1, data: [] };
      return [0x74, 0x20, (f.maxBlock >> 8) & 0xff, f.maxBlock & 0xff];
    }
    if (service === 0x36) {
      if (!st.dl) return nrc(0x36, 0x24);
      if (a !== st.dl.seq) return nrc(0x36, 0x73);
      st.dl.data.push(...req.slice(2));
      st.dl.seq = (st.dl.seq + 1) & 0xff;
      return [0x76, a];
    }
    if (service === 0x37) {
      if (!st.dl || st.dl.data.length !== st.dl.len) return nrc(0x37, 0x24);
      f.memory.set(st.dl.data, st.dl.addr - f.base);
      st.dl = null;
      st.written = true;
      return [0x77];
    }
    if (service === 0x11) {
      if (st.written && f.softwareBase) {
        const sw = `${f.softwareBase}-${sha256Hex(f.memory).slice(0, 4).toUpperCase()}`;
        ecu.dids = { ...(ecu.dids ?? {}), 0xf194: sw, 0xf195: sw };
      }
      this.boot.set(ecu, { session: 1, unlocked: false, seedOut: false, dl: null, written: false });
      return [0x51, a];
    }
    return null;
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
      // CAN: второй байт — число кодов. K-Line/J1850: числа нет, сразу пары (ответ дополняется нулями до 3 пар).
      if (v.bus === "kline") {
        const pairs = dtcs.flatMap(dtcToBytes);
        while (pairs.length % 6) pairs.push(0);
        return [service + 0x40, ...(pairs.length ? pairs : [0, 0, 0, 0, 0, 0])];
      }
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

    if (ecu.flash) {
      const r = this.bootloader(ecu, req);
      if (r) return r;
    }

    if (service === 0x1a) {
      const value = ecu.kwpIdent?.[a];
      return value === undefined ? [0x7f, 0x1a, 0x12] : [0x5a, a, ...asciiToBytes(value)];
    }

    if (service === 0x3e) return [0x7e, 0x00];
    // Неизвестная служба: блок есть, но отказывает.
    return [0x7f, service, 0x11];
  }
}
