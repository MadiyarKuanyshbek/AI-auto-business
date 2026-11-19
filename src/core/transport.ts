/**
 * Абстракция канала связи с OBD-адаптером. Всё ядро работает только через неё,
 * поэтому один и тот же код ходит и по BLE, и по Wi-Fi (TCP), и по Web Bluetooth,
 * и в тестах — через программный симулятор автомобиля.
 */
export interface Transport {
  readonly kind: "ble" | "wifi" | "webbluetooth" | "serial" | "demo";
  readonly label: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Отправляет сырую строку (ядро само добавляет "\r"). */
  write(data: string): Promise<void>;
  /** Подписка на входящие данные адаптера. Возвращает функцию отписки. */
  onData(listener: (chunk: string) => void): () => void;
  /** Вызывается, если соединение оборвалось само. */
  onClose(listener: () => void): () => void;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly code: "timeout" | "no_data" | "bus_error" | "unsupported" | "protocol" | "not_connected",
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
