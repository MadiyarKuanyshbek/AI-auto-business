import type { Transport } from "../core/transport";

// Web Serial (Chrome/Edge и настольное приложение): USB-кабели ELM327 и Bluetooth-адаптеры,
// спаренные в Windows (они создают виртуальный COM-порт, это самый частый вариант дешёвых адаптеров).

type SerialPortLike = {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

const nav = (typeof navigator !== "undefined" ? navigator : undefined) as
  | (Navigator & { serial?: { requestPort(o?: unknown): Promise<SerialPortLike> } })
  | undefined;

export const serialSupported = !!nav?.serial;

// У адаптеров разная скорость порта: чаще всего 38400, у новых 115200, у старых клонов 9600.
const BAUD_RATES = [38400, 115200, 9600, 57600];

export async function pickSerialTransport(): Promise<Transport> {
  if (!nav?.serial) throw new Error("Этот браузер не поддерживает COM-порты. Используйте настольное приложение или Chrome/Edge.");
  const port = await nav.serial.requestPort();
  return serialTransport(port);
}

function serialTransport(port: SerialPortLike): Transport {
  const data = new Set<(c: string) => void>();
  const close = new Set<() => void>();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  let open = false;

  const emit = (text: string) => data.forEach((l) => l(text));

  async function readLoop(r: ReadableStreamDefaultReader<Uint8Array>) {
    try {
      for (;;) {
        const { value, done } = await r.read();
        if (done) break;
        if (value) emit(String.fromCharCode(...value));
      }
    } catch {
      /* порт закрыт или отключён */
    } finally {
      if (open) {
        open = false;
        close.forEach((l) => l());
      }
    }
  }

  async function tryBaud(baudRate: number): Promise<boolean> {
    await port.open({ baudRate });
    open = true;
    reader = port.readable!.getReader();
    writer = port.writable!.getWriter();
    let seen = "";
    const probe = (c: string) => (seen += c);
    data.add(probe);
    void readLoop(reader);
    await writer.write(Uint8Array.from("ATZ\r", (ch) => ch.charCodeAt(0)));
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline && !/ELM|>|OK/i.test(seen)) await new Promise((r) => setTimeout(r, 100));
    data.delete(probe);
    if (/ELM|>|OK/i.test(seen)) return true;
    await release();
    return false;
  }

  async function release() {
    open = false;
    try {
      await reader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      reader?.releaseLock();
      writer?.releaseLock();
    } catch {
      /* ignore */
    }
    reader = null;
    writer = null;
    await port.close().catch(() => undefined);
  }

  return {
    kind: "webbluetooth", // тип для интерфейса не важен; подпись берётся из label
    label: "COM-порт (USB / Bluetooth)",
    async connect() {
      for (const baud of BAUD_RATES) {
        try {
          if (await tryBaud(baud)) return;
        } catch {
          await release();
        }
      }
      throw new Error("Адаптер на этом порту не отвечает. Проверьте, что выбран COM-порт именно OBD-адаптера и зажигание включено.");
    },
    async disconnect() {
      await release();
    },
    async write(text) {
      if (!writer) throw new Error("Нет соединения");
      await writer.write(Uint8Array.from(text, (c) => c.charCodeAt(0)));
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
