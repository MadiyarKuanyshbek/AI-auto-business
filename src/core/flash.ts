import { identifyFamily, matchCatalog, type CatalogItem } from "./catalog";
import type { ScannedEcu, VehicleScan } from "./scanner";
import { sha256Hex } from "./sha256";

/**
 * Прошивка блока. ВАЖНО: само чтение/запись памяти блока выполняет провайдер —
 * драйвер конкретного интерфейса (J2534, профильный программатор) и конкретного
 * семейства блоков. ELM327-адаптеры для этого не подходят: нет гарантий скорости и
 * буферизации, обрыв записи оставляет блок неработоспособным. Поэтому приложение
 * отказывается прошивать через ELM327, а весь процесс вокруг записи — предполётные
 * проверки, резервная копия, сверка файла, журнал — выполняется здесь одинаково для всех.
 */

export type FlashProgress = (stage: string, fraction: number) => void;

export interface FlashProvider {
  readonly id: string;
  readonly name: string;
  /** Может ли провайдер безопасно писать в этот блок. */
  canFlash(ecu: ScannedEcu): { ok: boolean; reason?: string };
  /** Полное чтение текущей прошивки блока (резервная копия оригинала). */
  readOriginal(ecu: ScannedEcu, onProgress: FlashProgress): Promise<Uint8Array>;
  write(ecu: ScannedEcu, file: Uint8Array, onProgress: FlashProgress): Promise<void>;
  /** Чтение обратно после записи — для сверки. */
  readBack(ecu: ScannedEcu, onProgress: FlashProgress): Promise<Uint8Array>;
}

export class ElmReadOnlyProvider implements FlashProvider {
  readonly id = "elm327-readonly";
  readonly name = "ELM327 (только диагностика)";
  canFlash() {
    return {
      ok: false,
      reason:
        "ELM327-адаптеры не подходят для прошивки блоков: нет гарантированной скорости и буферизации, при обрыве блок «кирпичится». Подключите J2534-интерфейс или профильный программатор.",
    };
  }
  async readOriginal(): Promise<Uint8Array> {
    throw new Error("unsupported");
  }
  async write(): Promise<void> {
    throw new Error("unsupported");
  }
  async readBack(): Promise<Uint8Array> {
    throw new Error("unsupported");
  }
}

/** Виртуальный блок: нужен для обучения, демо и тестов процесса. В реальный блок ничего не пишет. */
export class SimulatedFlashProvider implements FlashProvider {
  readonly id = "simulated";
  readonly name = "Симуляция (демо)";
  image: Uint8Array;
  failAtFraction: number | null = null;
  constructor(image: Uint8Array = Uint8Array.from({ length: 4096 }, (_, i) => (i * 31) & 0xff)) {
    this.image = image;
  }
  canFlash() {
    return { ok: true };
  }
  async readOriginal(_e: ScannedEcu, onProgress: FlashProgress) {
    onProgress("Чтение оригинала", 1);
    return this.image.slice();
  }
  async write(_e: ScannedEcu, file: Uint8Array, onProgress: FlashProgress) {
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      if (this.failAtFraction !== null && i / steps >= this.failAtFraction) throw new Error("Обрыв связи во время записи");
      onProgress("Запись", i / steps);
    }
    this.image = file.slice();
  }
  async readBack(_e: ScannedEcu, onProgress: FlashProgress) {
    onProgress("Чтение для проверки", 1);
    return this.image.slice();
  }
}

// ───────────── Предполётные проверки ─────────────

export type Check = { id: string; ok: boolean; blocking: boolean; text: string };

export type FlashRequest = {
  scan: VehicleScan;
  ecu: ScannedEcu;
  item: CatalogItem;
  file: Uint8Array | null;
  provider: FlashProvider;
  /** Свежее измеренное напряжение бортсети (В). */
  voltage: number | null;
  backup: Uint8Array | null;
  ack: { customerConsent: boolean; legalNotice: boolean; offRoad: boolean };
};

export const MIN_FLASH_VOLTAGE = 12.5;

export function preflight(req: FlashRequest): Check[] {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, text: string, blocking = true) => checks.push({ id, ok, blocking, text });

  const can = req.provider.canFlash(req.ecu);
  add("provider", can.ok, can.ok ? `Интерфейс: ${req.provider.name}` : (can.reason ?? "Интерфейс не поддерживает запись"));

  add("not-demo", req.item.status !== "demo", req.item.status === "demo" ? "Позиция каталога демонстрационная: рабочего файла нет" : `Статус позиции: ${req.item.status}`);
  add("file", !!req.file && req.file.length > 0, req.file ? `Файл загружен (${req.file.length} байт)` : "Файл прошивки не выбран");

  if (req.file && req.item.fileSha256) {
    const actual = sha256Hex(req.file);
    add("hash", actual === req.item.fileSha256.toLowerCase(), actual === req.item.fileSha256.toLowerCase() ? "Контрольная сумма файла совпадает с каталогом" : "Контрольная сумма файла НЕ совпадает с каталогом: файл повреждён или подменён");
  } else if (req.file) {
    add("hash", false, "У позиции каталога нет эталонной контрольной суммы — файл проверить нельзя");
  }

  const match = matchCatalog(req.scan, [req.item]).find((m) => m.ecu.txId === req.ecu.txId);
  add(
    "ecu-match",
    match?.confidence === "exact",
    match?.confidence === "exact"
      ? "Номер ПО блока совпадает с позицией каталога"
      : match
        ? `Блок похож по семейству (${identifyFamily(req.ecu).name}), но номер ПО не совпал: прошивка заблокирована`
        : "Эта позиция не предназначена для выбранного блока",
  );

  add(
    "voltage",
    req.voltage !== null && req.voltage >= MIN_FLASH_VOLTAGE,
    req.voltage === null ? "Напряжение бортсети не измерено" : `Напряжение ${req.voltage.toFixed(1)} В (нужно ≥ ${MIN_FLASH_VOLTAGE} В, лучше зарядное устройство)`,
  );

  add("backup", !!req.backup && req.backup.length > 0, req.backup ? `Резервная копия оригинала сохранена (${req.backup.length} байт)` : "Нет резервной копии оригинальной прошивки");
  add("dtc", req.scan.dtcs.length === 0, req.scan.dtcs.length === 0 ? "Активных ошибок нет" : `Есть ошибки: ${req.scan.dtcs.map((d) => d.code).join(", ")}`, false);
  add("consent", req.ack.customerConsent, "Согласие владельца авто получено");
  add("legal", req.ack.legalNotice, "Предупреждение о выбросах и гарантии прочитано");
  if (!req.item.roadLegal) add("offroad", req.ack.offRoad, "Позиция не для дорог общего пользования: подтвердите использование только вне дорог");

  return checks;
}

export const canStart = (checks: Check[]) => checks.every((c) => c.ok || !c.blocking);

// ───────────── Выполнение ─────────────

export type AuditEntry = { t: number; event: string; detail?: string };
export type FlashOutcome =
  | { status: "success"; audit: AuditEntry[]; backupSha256: string; fileSha256: string }
  | { status: "failed"; audit: AuditEntry[]; error: string; needsRecovery: boolean };

/**
 * Выполняет прошивку по шагам. Если запись оборвалась — предлагаем восстановить оригинал
 * из резервной копии (needsRecovery), потому что блок мог остаться в неопределённом состоянии.
 */
export async function runFlash(req: FlashRequest, onProgress: FlashProgress = () => {}): Promise<FlashOutcome> {
  const audit: AuditEntry[] = [];
  const log = (event: string, detail?: string) => audit.push({ t: Date.now(), event, detail });

  const checks = preflight(req);
  if (!canStart(checks)) {
    const failed = checks.filter((c) => !c.ok && c.blocking).map((c) => c.text);
    log("preflight_failed", failed.join("; "));
    return { status: "failed", audit, error: `Проверки не пройдены: ${failed.join("; ")}`, needsRecovery: false };
  }
  const file = req.file as Uint8Array;
  const backup = req.backup as Uint8Array;
  log("start", `${req.item.id} → ${req.ecu.txId}`);
  log("backup_sha256", sha256Hex(backup));
  log("file_sha256", sha256Hex(file));

  let writeStarted = false;
  try {
    writeStarted = true;
    log("write_begin");
    await req.provider.write(req.ecu, file, (s, f) => onProgress(s, 0.1 + f * 0.7));
    log("write_done");
    const back = await req.provider.readBack(req.ecu, (s, f) => onProgress(s, 0.8 + f * 0.2));
    if (sha256Hex(back) !== sha256Hex(file)) {
      log("verify_failed");
      return { status: "failed", audit, error: "После записи содержимое блока не совпало с файлом", needsRecovery: true };
    }
    log("verify_ok");
    return { status: "success", audit, backupSha256: sha256Hex(backup), fileSha256: sha256Hex(file) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log("write_error", message);
    return { status: "failed", audit, error: message, needsRecovery: writeStarted };
  }
}

/** Возврат оригинальной прошивки из резервной копии после неудачной записи. */
export async function recoverOriginal(req: FlashRequest, onProgress: FlashProgress = () => {}): Promise<{ ok: boolean; error?: string }> {
  if (!req.backup) return { ok: false, error: "Нет резервной копии" };
  try {
    await req.provider.write(req.ecu, req.backup, onProgress);
    const back = await req.provider.readBack(req.ecu, onProgress);
    return sha256Hex(back) === sha256Hex(req.backup) ? { ok: true } : { ok: false, error: "Восстановление не прошло сверку" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка восстановления" };
  }
}
