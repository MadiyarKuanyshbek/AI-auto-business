import type { Elm327 } from "./elm327";
import { hexToBytes } from "./hex";
import { computeKey, SECURITY_ALGORITHMS, type FirmwarePackage } from "./package";
import type { ScannedEcu, VehicleScan } from "./scanner";
import { sha256Hex } from "./sha256";
import { readIdentification, udsRequest } from "./uds";

/**
 * Установка пакета прошивки в блок по UDS через адаптер на чипе STN (Bluetooth LE, Wi-Fi, USB).
 * Выполняет стандартную последовательность загрузки (ISO 14229): сессия программирования →
 * SecurityAccess → стирание → RequestDownload/TransferData/RequestTransferExit → проверка → сброс,
 * затем читает номер ПО блока и сверяет его с ожидаемым.
 *
 * ВАЖНО: это стандартная схема, но у каждого блока свои адреса, алгоритм ключа и особенности загрузчика.
 * Пакет должен быть составлен под конкретное семейство блоков; без него установка не запускается.
 */

export const MIN_FLASH_VOLTAGE = 12.5;

export type Check = { id: string; ok: boolean; blocking: boolean; text: string };

export type InstallProgress = (stage: string, fraction: number) => void;
export type SegmentData = { address: number; data: Uint8Array };

export type InstallRequest = {
  elm: Elm327;
  scan: VehicleScan;
  ecu: ScannedEcu;
  pkg: FirmwarePackage;
  segments: SegmentData[];
  /** Вид канала связи: для Bluetooth требуем отдельного подтверждения риска. */
  transportKind: "ble" | "wifi" | "webbluetooth" | "serial" | "demo";
  voltage: number | null;
  backup: Uint8Array | null;
  ack: { customerConsent: boolean; legalNotice: boolean; offRoad: boolean; wirelessRisk: boolean };
};

const softwareIds = (e: ScannedEcu) =>
  [e.ident.softwareNumber, e.ident.supplierSoftwareNumber, e.ident.softwareVersion, e.ident.supplierSoftwareVersion, e.ident.sparePartNumber]
    .filter((v): v is string => !!v)
    .map((v) => v.toUpperCase());

export function ecuMatchesPackage(ecu: ScannedEcu, pkg: FirmwarePackage): boolean {
  if (pkg.target.txId && pkg.target.txId.toUpperCase() !== ecu.txId.toUpperCase()) return false;
  const ids = softwareIds(ecu);
  return pkg.target.softwareNumbers.some((n) => ids.includes(n.toUpperCase()));
}

export function installChecks(req: InstallRequest): Check[] {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, text: string, blocking = true) => checks.push({ id, ok, blocking, text });
  const { pkg, elm } = req;

  add(
    "adapter",
    elm.isStn,
    elm.isStn
      ? `Адаптер: ${elm.chip} (умеет длинные сообщения)`
      : "Адаптер не подходит для прошивки: обычные ELM327 не отправляют длинные сообщения. Нужен адаптер на чипе STN (например OBDLink CX или MX+).",
  );
  add(
    "demo",
    !pkg.demo || req.transportKind === "demo",
    pkg.demo && req.transportKind !== "demo" ? "Это демонстрационный пакет: его можно ставить только на виртуальный автомобиль" : `Пакет: ${pkg.title} v${pkg.version}`,
  );
  add(
    "ecu-match",
    ecuMatchesPackage(req.ecu, pkg),
    ecuMatchesPackage(req.ecu, pkg) ? "Номер ПО блока совпадает с пакетом" : "Пакет не предназначен для этого блока (номер ПО не совпал): установка заблокирована",
  );
  const algo = pkg.procedure.security?.algorithm;
  add("security", !algo || !!SECURITY_ALGORITHMS[algo], !algo ? "Доступ к блоку без ключа" : SECURITY_ALGORITHMS[algo] ? `Алгоритм доступа «${algo}» известен` : `Алгоритм доступа «${algo}» не поддерживается этим приложением`);
  add(
    "voltage",
    req.voltage !== null && req.voltage >= MIN_FLASH_VOLTAGE,
    req.voltage === null ? "Напряжение бортсети не измерено" : `Напряжение ${req.voltage.toFixed(1)} В (нужно ≥ ${MIN_FLASH_VOLTAGE} В, лучше зарядное устройство)`,
  );
  add(
    "backup",
    !!req.backup && req.backup.length > 0,
    req.backup ? `Резервная копия оригинала есть (${req.backup.length} байт)` : pkg.procedure.backup ? "Нет резервной копии: сначала прочитайте оригинал" : "В пакете не описана область резервной копии: установка заблокирована",
  );
  add("dtc", req.scan.dtcs.length === 0, req.scan.dtcs.length === 0 ? "Активных ошибок нет" : `Есть ошибки: ${req.scan.dtcs.map((d) => d.code).join(", ")}`, false);
  if (req.transportKind === "ble" || req.transportKind === "webbluetooth" || req.transportKind === "wifi") {
    add("wireless", req.ack.wirelessRisk, "Я понимаю риск обрыва беспроводной связи во время записи (устройство рядом с авто, зарядка подключена)");
  }
  add("consent", req.ack.customerConsent, "Согласие владельца авто получено");
  add("legal", req.ack.legalNotice, "Предупреждение о выбросах и гарантии прочитано");
  if (!pkg.roadLegal) add("offroad", req.ack.offRoad, "Пакет не для дорог общего пользования: подтвердите использование только вне дорог");
  return checks;
}

// ───────────── Низкоуровневые шаги ─────────────

async function must(elm: Elm327, request: number[], label: string, timeoutMs = 15000): Promise<number[]> {
  const r = await udsRequest(elm, request, timeoutMs);
  if (!r.ok) throw new Error(`${label}: ${r.reason}`);
  return r.data;
}

const toBytes = (value: number, count: number) => Array.from({ length: count }, (_, i) => (value >>> (8 * (count - 1 - i))) & 0xff);

function addrLen(fmt: number, address: number, length: number): number[] {
  const lenBytes = fmt >> 4;
  const addrBytes = fmt & 0x0f;
  return [...toBytes(address, addrBytes), ...toBytes(length, lenBytes)];
}

async function openSession(elm: Elm327, pkg: FirmwarePackage, onStep: (s: string) => void) {
  const p = pkg.procedure;
  if (p.extendedSession !== undefined) {
    onStep("Расширенная сессия");
    await must(elm, [0x10, p.extendedSession], "Расширенная сессия");
  }
  if (p.disableDtc) {
    onStep("Отключение записи ошибок");
    await udsRequest(elm, [0x85, 0x02]).catch(() => undefined); // не критично, если блок не поддерживает
  }
  onStep("Сессия программирования");
  await must(elm, [0x10, p.programmingSession], "Сессия программирования");
  if (p.security) {
    onStep("Доступ к блоку (SecurityAccess)");
    const data = await must(elm, [0x27, p.security.level], "Запрос сида");
    const seed = data.slice(1);
    if (seed.some((b) => b !== 0)) {
      const key = computeKey(p.security, seed);
      if (!key) throw new Error(`Алгоритм доступа «${p.security.algorithm}» не поддерживается`);
      await must(elm, [0x27, p.security.level + 1, ...key], "Отправка ключа");
    }
  }
}

/** Чтение оригинальной прошивки (ReadMemoryByAddress) — резервная копия перед установкой. */
export async function readBackup(elm: Elm327, ecu: ScannedEcu, pkg: FirmwarePackage, onProgress: InstallProgress = () => {}): Promise<Uint8Array> {
  const b = pkg.procedure.backup;
  if (!b) throw new Error("В пакете не описана область резервной копии");
  await elm.target(ecu.txId, ecu.rxId);
  await openSession(elm, pkg, (s) => onProgress(s, 0.02));
  const fmt = b.addressAndLengthFormat ?? 0x44;
  const chunk = b.chunk ?? 1024;
  const out = new Uint8Array(b.length);
  for (let off = 0; off < b.length; off += chunk) {
    const n = Math.min(chunk, b.length - off);
    const data = await must(elm, [0x23, fmt, ...addrLen(fmt, b.address + off, n).slice(0)], "Чтение памяти", 20000);
    if (data.length < n) throw new Error("Блок вернул меньше данных, чем запрошено");
    out.set(data.slice(0, n), off);
    onProgress("Чтение оригинальной прошивки", Math.min(1, (off + n) / b.length));
  }
  return out;
}

async function writeSegments(elm: Elm327, pkg: FirmwarePackage, segments: SegmentData[], onProgress: InstallProgress, from: number, span: number) {
  const p = pkg.procedure;
  const total = segments.reduce((s, x) => s + x.data.length, 0);
  let done = 0;

  if (p.erase) {
    onProgress("Стирание памяти", from);
    await must(elm, [0x31, 0x01, p.erase.routineId >> 8, p.erase.routineId & 0xff, ...hexToBytes(p.erase.dataHex ?? "")], "Стирание", 120000);
  }

  const fmt = p.download.addressAndLengthFormat ?? 0x44;
  for (const seg of segments) {
    const reply = await must(elm, [0x34, p.download.dataFormat ?? 0x00, fmt, ...addrLen(fmt, seg.address, seg.data.length)], "RequestDownload");
    const lenBytes = reply[0] >> 4;
    const maxBlock = reply.slice(1, 1 + lenBytes).reduce((a, b) => a * 256 + b, 0);
    if (!maxBlock || maxBlock < 3) throw new Error("Блок вернул некорректный размер блока передачи");
    const block = Math.min(maxBlock - 2, 2048);
    let seq = 1;
    for (let off = 0; off < seg.data.length; off += block) {
      const chunk = Array.from(seg.data.slice(off, off + block));
      const r = await must(elm, [0x36, seq, ...chunk], "TransferData", 30000);
      if (r[0] !== seq) throw new Error("Блок подтвердил другой номер пакета данных");
      seq = (seq + 1) & 0xff;
      done += chunk.length;
      onProgress("Запись", from + span * (done / total));
    }
    await must(elm, [0x37], "RequestTransferExit", 30000);
  }
}

// ───────────── Установка ─────────────

export type AuditEntry = { t: number; event: string; detail?: string };
export type InstallOutcome =
  | { status: "success"; audit: AuditEntry[]; newSoftware?: string }
  | { status: "failed"; audit: AuditEntry[]; error: string; needsRecovery: boolean };

export async function installPackage(req: InstallRequest, onProgress: InstallProgress = () => {}): Promise<InstallOutcome> {
  const audit: AuditEntry[] = [];
  const log = (event: string, detail?: string) => audit.push({ t: Date.now(), event, detail });

  const checks = installChecks(req);
  const blockers = checks.filter((c) => !c.ok && c.blocking);
  if (blockers.length) {
    log("preflight_failed", blockers.map((c) => c.text).join("; "));
    return { status: "failed", audit, error: `Проверки не пройдены: ${blockers.map((c) => c.text).join("; ")}`, needsRecovery: false };
  }

  const { elm, ecu, pkg } = req;
  log("start", `${pkg.id}@${pkg.version} → ${ecu.txId}`);
  log("backup_sha256", sha256Hex(req.backup as Uint8Array));
  let writeStarted = false;
  try {
    await elm.target(ecu.txId, ecu.rxId);
    await openSession(elm, pkg, (s) => {
      log("step", s);
      onProgress(s, 0.03);
    });

    writeStarted = true;
    log("write_begin");
    await writeSegments(elm, pkg, req.segments, onProgress, 0.1, 0.75);
    log("write_done");

    const p = pkg.procedure;
    if (p.check) {
      onProgress("Проверка целостности в блоке", 0.88);
      await must(elm, [0x31, 0x01, p.check.routineId >> 8, p.check.routineId & 0xff, ...hexToBytes(p.check.dataHex ?? "")], "Проверка целостности", 120000);
      log("check_ok");
    }

    onProgress("Перезапуск блока", 0.92);
    // После сброса блок может не ответить — это нормально.
    await udsRequest(elm, [0x11, p.resetType ?? 0x01], 3000).catch(() => undefined);
    log("reset_sent");

    // Ждём возвращения блока и читаем номер ПО.
    let newSoftware: string | undefined;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 800 : 1500));
      try {
        await elm.target(ecu.txId, ecu.rxId);
        const { ident } = await readIdentification(elm);
        newSoftware = ident.supplierSoftwareNumber ?? ident.softwareNumber ?? ident.softwareVersion;
        if (newSoftware) break;
      } catch {
        /* блок ещё перезагружается */
      }
    }
    log("software_after", newSoftware ?? "не считан");
    if (pkg.expectedSoftwareNumber && newSoftware?.toUpperCase() !== pkg.expectedSoftwareNumber.toUpperCase()) {
      log("verify_failed", `ожидали ${pkg.expectedSoftwareNumber}`);
      return { status: "failed", audit, error: `После установки блок показывает ПО «${newSoftware ?? "не считано"}», ожидалось «${pkg.expectedSoftwareNumber}»`, needsRecovery: true };
    }
    onProgress("Готово", 1);
    return { status: "success", audit, newSoftware };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log("error", message);
    return { status: "failed", audit, error: message, needsRecovery: writeStarted };
  }
}

/** Возвращает оригинальную прошивку из резервной копии (после обрыва или неудачной проверки). */
export async function restoreBackup(req: InstallRequest, onProgress: InstallProgress = () => {}): Promise<{ ok: boolean; error?: string }> {
  const b = req.pkg.procedure.backup;
  if (!req.backup || !b) return { ok: false, error: "Нет резервной копии" };
  try {
    await req.elm.target(req.ecu.txId, req.ecu.rxId);
    await openSession(req.elm, req.pkg, (s) => onProgress(s, 0.05));
    await writeSegments(req.elm, req.pkg, [{ address: b.address, data: req.backup }], onProgress, 0.1, 0.8);
    await udsRequest(req.elm, [0x11, req.pkg.procedure.resetType ?? 0x01], 3000).catch(() => undefined);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка восстановления" };
  }
}
