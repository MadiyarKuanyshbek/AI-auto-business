import { AdapterError, type Transport } from "./transport";

/** Сообщение одного ЭБУ после сборки многокадрового ответа ISO-TP. */
export type EcuMessage = {
  /** CAN-идентификатор ответившего блока, например "7E8"; null — если адаптер не показывает заголовки. */
  ecu: string | null;
  data: number[];
};

const ERROR_LINES: { re: RegExp; code: AdapterError["code"]; text: string }[] = [
  { re: /^NO DATA$/, code: "no_data", text: "Нет ответа от блока" },
  { re: /UNABLE TO CONNECT/, code: "bus_error", text: "Адаптер не видит шину авто (зажигание включено?)" },
  { re: /CAN ERROR|BUS ERROR|FB ERROR|DATA ERROR|<DATA ERROR|ERR\d\d|BUS BUSY/, code: "bus_error", text: "Ошибка шины CAN" },
  { re: /^STOPPED$/, code: "protocol", text: "Запрос прерван" },
  { re: /BUFFER FULL/, code: "protocol", text: "Переполнен буфер адаптера" },
  { re: /^\?$/, code: "unsupported", text: "Адаптер не понял команду" },
];

const NOISE = [/^SEARCHING\.\.\.$/, /^BUS INIT:/, /^OK$/];

function isHexByte(token: string) {
  return /^[0-9A-F]{2}$/.test(token);
}

/**
 * Разбор строк ответа ELM327 в сообщения по блокам. Понимает оба режима вывода:
 *  - ATH1 — кадры с заголовком ("7E8 10 14 49 02 01 ..."), ISO-TP собираем сами;
 *  - ATH0 — многострочные ответы вида "014 / 0: 49 02 .. / 1: .." и одиночные.
 */
export function parseResponseLines(lines: string[]): EcuMessage[] {
  const messages: EcuMessage[] = [];
  const pending = new Map<string, { total: number; buf: number[] }>();
  const order: string[] = [];

  let headerless: { total: number; buf: number[] } | null = null;

  const flushHeaderless = () => {
    if (headerless) {
      messages.push({ ecu: null, data: headerless.buf.slice(0, headerless.total || undefined) });
      headerless = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim().toUpperCase();
    if (!line) continue;

    const numbered = line.match(/^([0-9A-F]):\s*(.+)$/);
    if (numbered) {
      const bytes = numbered[2].split(/\s+/).filter(isHexByte).map((t) => parseInt(t, 16));
      if (!headerless) headerless = { total: 0, buf: [] };
      headerless.buf.push(...bytes);
      continue;
    }

    // Строка с длиной перед нумерованными: "014" — три hex-символа без пробелов.
    if (/^[0-9A-F]{3}$/.test(line)) {
      flushHeaderless();
      headerless = { total: parseInt(line, 16), buf: [] };
      continue;
    }

    const tokens = line.split(/\s+/);
    const first = tokens[0];
    const hasHeader = tokens.length > 1 && (/^[0-9A-F]{3}$/.test(first) || /^[0-9A-F]{8}$/.test(first));
    const rest = (hasHeader ? tokens.slice(1) : tokens).filter(isHexByte);
    if (rest.length === 0 || rest.length !== (hasHeader ? tokens.length - 1 : tokens.length)) continue;
    const bytes = rest.map((t) => parseInt(t, 16));

    if (!hasHeader) {
      flushHeaderless();
      messages.push({ ecu: null, data: bytes });
      continue;
    }

    const pci = bytes[0] >> 4;
    if (pci === 0) {
      const len = bytes[0] & 0x0f;
      messages.push({ ecu: first, data: bytes.slice(1, 1 + len) });
    } else if (pci === 1) {
      const total = ((bytes[0] & 0x0f) << 8) | bytes[1];
      pending.set(first, { total, buf: bytes.slice(2) });
      order.push(first);
    } else if (pci === 2) {
      const entry = pending.get(first);
      if (entry) entry.buf.push(...bytes.slice(1));
    }
    // pci === 3 — кадр управления потоком, нам не нужен.
  }

  flushHeaderless();
  for (const header of order) {
    const entry = pending.get(header);
    if (entry) messages.push({ ecu: header, data: entry.buf.slice(0, entry.total) });
    pending.delete(header);
  }
  return messages;
}

/** Тип шины, на которой адаптер нашёл автомобиль (ATDPN). */
export type BusKind = "can11" | "can29" | "kline" | "j1850" | "unknown";

/** Номер протокола ELM327 (ATDPN, без префикса "A" авто-режима) → тип шины. */
export function busKindFromProtocolId(id: string): BusKind {
  const n = id.replace(/^A/i, "").trim().toUpperCase();
  if (n === "6" || n === "8") return "can11";
  if (n === "7" || n === "9" || n === "A" || n === "B" || n === "C") return "can29";
  if (n === "3" || n === "4" || n === "5") return "kline";
  if (n === "1" || n === "2") return "j1850";
  return "unknown";
}

/**
 * Разбор ответов по K-Line (ISO 9141-2 и KWP2000), адаптер выдаёт кадры целиком с заголовком:
 *  - ISO 9141-2:  "48 6B 11 41 0C 1A F8 BA"   (заголовок 48 6B <источник>, данные, контрольная сумма)
 *  - KWP2000:     "83 F1 10 5A 94 .. CS"      (формат 0x80|длина, получатель, источник, данные, сумма)
 * Контрольная сумма отбрасывается. Многокадровые ответы остаются отдельными сообщениями (номер кадра внутри).
 */
export function parseKLineLines(lines: string[]): EcuMessage[] {
  const out: EcuMessage[] = [];
  for (const raw of lines) {
    const tokens = raw.trim().toUpperCase().split(/\s+/);
    if (tokens.length < 5 || !tokens.every(isHexByte)) continue;
    const b = tokens.map((t) => parseInt(t, 16));
    const hex = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();

    if (b[0] === 0x48 && b[1] === 0x6b) {
      out.push({ ecu: hex(b[2]), data: b.slice(3, -1) });
      continue;
    }
    if ((b[0] & 0xc0) === 0x80 || (b[0] & 0xc0) === 0xc0) {
      let len = b[0] & 0x3f;
      let start = 3;
      if (len === 0) {
        len = b[3];
        start = 4;
      }
      out.push({ ecu: hex(b[2]), data: b.slice(start, start + len) });
    }
  }
  return out;
}

export type InitInfo = { version: string; protocol: string; voltage: number | null };

/** Драйвер ELM327-совместимого адаптера (BLE / Wi-Fi / симулятор — через Transport). */
export class Elm327 {
  private buffer = "";
  private waiter: ((text: string) => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private unsubscribe: (() => void) | null = null;
  /** Журнал обмена — показывается в экране диагностики и прикладывается к отчёту об ошибке. */
  readonly log: { t: number; dir: "tx" | "rx"; text: string }[] = [];
  private logMax = 400;
  /** Шина авто; определяется после первого успешного запроса (detectBus). */
  bus: BusKind = "can11";

  constructor(readonly transport: Transport) {}

  async open(): Promise<void> {
    await this.transport.connect();
    this.unsubscribe = this.transport.onData((chunk) => {
      this.buffer += chunk;
      if (this.buffer.includes(">") && this.waiter) {
        const text = this.buffer;
        this.buffer = "";
        const w = this.waiter;
        this.waiter = null;
        w(text);
      }
    });
  }

  async close(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.transport.disconnect();
  }

  private record(dir: "tx" | "rx", text: string) {
    this.log.push({ t: Date.now(), dir, text });
    if (this.log.length > this.logMax) this.log.splice(0, this.log.length - this.logMax);
  }

  /** Отправляет команду и ждёт приглашение ">" — команды выполняются строго по очереди. */
  raw(command: string, timeoutMs = 4000): Promise<string[]> {
    const run = async () => {
      this.buffer = "";
      this.record("tx", command);
      const response = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.waiter = null;
          reject(new AdapterError(`Таймаут ответа на «${command}»`, "timeout"));
        }, timeoutMs);
        this.waiter = (text) => {
          clearTimeout(timer);
          resolve(text);
        };
      });
      await this.transport.write(`${command}\r`);
      const text = await response;
      this.record("rx", text.replace(/\r/g, "\n").trim());
      return text
        .replace(/>/g, "")
        .split(/[\r\n]+/)
        .map((l) => l.trim())
        .filter((l) => l && l.toUpperCase() !== command.toUpperCase());
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** AT-команда: должна вернуть "OK" (или осмысленный текст). */
  async at(command: string, timeoutMs = 3000): Promise<string[]> {
    const lines = await this.raw(command, timeoutMs);
    this.throwIfError(lines);
    return lines;
  }

  private throwIfError(lines: string[]) {
    for (const line of lines) {
      const upper = line.toUpperCase();
      for (const e of ERROR_LINES) {
        if (e.re.test(upper)) throw new AdapterError(e.text, e.code);
      }
    }
  }

  async init(): Promise<InitInfo> {
    await this.raw("ATZ", 6000).catch(() => undefined); // сброс; ответ — строка версии
    await this.at("ATE0"); // без эха
    await this.at("ATL0"); // без перевода строки
    await this.at("ATS1"); // с пробелами между байтами — проще разбирать
    await this.at("ATH1"); // заголовки — нужны, чтобы различать блоки
    await this.at("ATCAF1"); // авто-форматирование ISO-TP
    await this.at("ATST FF"); // таймаут ответа ~1 с (блоки бывают медленными)
    await this.at("ATSP0"); // авто-поиск протокола
    const version = (await this.at("ATI")).join(" ");
    const voltage = await this.voltage().catch(() => null);
    return { version, protocol: "auto", voltage };
  }

  /** Определённый адаптером протокол — после первого успешного запроса к авто. */
  async protocol(): Promise<string> {
    const lines = await this.at("ATDP");
    return lines.join(" ").replace(/^AUTO,\s*/i, "");
  }

  /** Номер протокола, найденный адаптером (ATDPN), и тип шины. Вызывать после первого запроса к авто. */
  async detectBus(): Promise<{ id: string; bus: BusKind }> {
    const lines = await this.at("ATDPN");
    const id = lines.join("").replace(/\s/g, "");
    this.bus = busKindFromProtocolId(id);
    return { id, bus: this.bus };
  }

  async voltage(): Promise<number | null> {
    const lines = await this.raw("ATRV");
    const m = lines.join(" ").match(/(\d+(?:\.\d+)?)\s*V/i);
    return m ? Number(m[1]) : null;
  }

  /**
   * Направляет запросы конкретному блоку и фильтрует ответы только от него.
   * CAN 11 бит: txId "7E0", rxId "7E8". CAN 29 бит: txId "18DA10F1", rxId "18DAF110".
   * K-Line: txId — адрес блока ("10" — двигатель), rxId не используется.
   */
  async target(txId: string, rxId: string) {
    if (this.bus === "kline") {
      await this.at(`ATSH81${txId}F1`); // формат KWP "81", получатель, источник тестера F1
      return;
    }
    if (this.bus === "can29" && txId.length === 8) {
      await this.at(`ATCP${txId.slice(0, 2)}`); // приоритет (18)
      await this.at(`ATSH${txId.slice(2)}`);
      await this.at(`ATCRA${rxId}`);
      return;
    }
    await this.at(`ATSH${txId}`);
    await this.at(`ATCRA${rxId}`);
  }

  async clearTarget() {
    await this.at("ATAR");
    if (this.bus === "kline") await this.at("ATSH686AF1");
    else if (this.bus === "can29") {
      await this.at("ATCP18");
      await this.at("ATSHDB33F1");
    } else await this.at("ATSH7DF");
  }

  /**
   * Отправляет диагностический запрос (hex без пробелов, например "22F190") и
   * возвращает собранные ответы блоков. Бросает AdapterError, если ответа нет.
   */
  async request(payloadHex: string, timeoutMs = 5000): Promise<EcuMessage[]> {
    const lines = await this.raw(payloadHex, timeoutMs);
    this.throwIfError(lines);
    const clean = lines.filter((l) => !NOISE.some((n) => n.test(l.toUpperCase())));
    const messages = this.bus === "kline" ? parseKLineLines(clean) : parseResponseLines(clean);
    if (messages.length === 0) throw new AdapterError("Нет ответа от блока", "no_data");
    return messages;
  }
}
