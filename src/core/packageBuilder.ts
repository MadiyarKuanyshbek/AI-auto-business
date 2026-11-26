import { buildPackage, parsePackage, SECURITY_ALGORITHMS, type FirmwarePackage } from "./package";

export type BuilderForm = {
  title: string;
  version: string;
  description: string;
  category: NonNullable<FirmwarePackage["category"]>;
  /** Номера ПО блока через запятую или пробел: для каких блоков пакет (точное совпадение). */
  targetSoftware: string;
  /** CAN-идентификатор блока для запросов, например 7E0. */
  txId: string;
  /** Номер ПО, который блок должен показать после прошивки (проверка результата). */
  expectedSoftware: string;
  data: Uint8Array | null;
  /** Адрес начала данных в памяти блока, hex (например 80000 или 0x80000). */
  address: string;
  programmingSession: string;
  extendedSession: boolean;
  disableDtc: boolean;
  securityLevel: string;
  algorithm: string;
  eraseRoutine: string;
  checkRoutine: string;
  resetType: string;
  backupAddress: string;
  backupLength: string;
  roadLegal: boolean;
  themeId: string;
};

export const EMPTY_FORM: BuilderForm = {
  title: "",
  version: "1.0.0",
  description: "",
  category: "engine",
  targetSoftware: "",
  txId: "7E0",
  expectedSoftware: "",
  data: null,
  address: "",
  programmingSession: "02",
  extendedSession: true,
  disableDtc: true,
  securityLevel: "11",
  algorithm: "",
  eraseRoutine: "FF00",
  checkRoutine: "",
  resetType: "01",
  backupAddress: "",
  backupLength: "",
  roadLegal: true,
  themeId: "",
};

const hex = (v: string): number | null => {
  const t = v.trim().replace(/^0x/i, "");
  return /^[0-9a-f]+$/i.test(t) ? parseInt(t, 16) : null;
};

export type BuildResult = { ok: true; pkg: FirmwarePackage } | { ok: false; error: string };

/** Собирает пакет из формы: проверяет поля и возвращает готовый пакет (с контрольной суммой данных). */
export function buildPackageFromForm(f: BuilderForm): BuildResult {
  const fail = (error: string): BuildResult => ({ ok: false, error });
  if (!f.title.trim()) return fail("Укажите название пакета");
  if (!/^\d+(\.\d+)*$/.test(f.version.trim())) return fail("Версия должна быть вида 1.0.0");
  const software = f.targetSoftware.split(/[\s,;]+/).filter(Boolean);
  if (software.length === 0) return fail("Укажите номер ПО блока, для которого пакет (его показывает сканирование)");
  if (!f.data || f.data.length === 0) return fail("Выберите файл с данными прошивки");
  const address = hex(f.address);
  if (address === null) return fail("Адрес записи: шестнадцатеричное число, например 80000");
  const session = hex(f.programmingSession);
  if (session === null) return fail("Сессия программирования: hex, обычно 02");

  let security: FirmwarePackage["procedure"]["security"];
  if (f.securityLevel.trim()) {
    const level = hex(f.securityLevel);
    if (level === null || level % 2 === 0) return fail("Уровень доступа должен быть нечётным hex-числом (например 11)");
    if (!f.algorithm || !SECURITY_ALGORITHMS[f.algorithm]) return fail("Выберите алгоритм ключа доступа: без него блок не откроется");
    security = { level, algorithm: f.algorithm, params: f.algorithm === "demo-xor-add" ? { maskHex: "5A" } : {} };
  }

  const erase = f.eraseRoutine.trim() ? hex(f.eraseRoutine) : undefined;
  if (erase === null) return fail("Стирание: hex-идентификатор процедуры, например FF00");
  const check = f.checkRoutine.trim() ? hex(f.checkRoutine) : undefined;
  if (check === null) return fail("Проверка: hex-идентификатор процедуры или пусто");
  const reset = hex(f.resetType || "01");
  if (reset === null) return fail("Тип сброса: hex, обычно 01");

  const backupAddress = hex(f.backupAddress);
  const backupLength = hex(f.backupLength);
  if (backupAddress === null || backupLength === null || backupLength === 0) {
    return fail("Укажите область резервной копии (адрес и длина, hex): без неё установка заблокирована");
  }
  if (!/^[0-9a-f]{3,8}$/i.test(f.txId.trim())) return fail("Адрес блока (txId): например 7E0");

  const slug = f.title.trim().toLowerCase().replace(/[^a-z0-9а-яё]+/g, "-").replace(/^-|-$/g, "") || "pkg";
  const pkg = buildPackage({
    id: slug,
    version: f.version.trim(),
    title: f.title.trim(),
    description: f.description.trim() || undefined,
    category: f.category,
    interface: f.category === "interface" && f.themeId ? { theme: f.themeId } : undefined,
    target: { softwareNumbers: software, txId: f.txId.trim().toUpperCase() },
    expectedSoftwareNumber: f.expectedSoftware.trim() || undefined,
    procedure: {
      kind: "uds-download",
      extendedSession: f.extendedSession ? 0x03 : undefined,
      disableDtc: f.disableDtc,
      programmingSession: session,
      security,
      erase: erase === undefined ? undefined : { routineId: erase },
      download: { dataFormat: 0x00, addressAndLengthFormat: 0x44 },
      check: check === undefined ? undefined : { routineId: check },
      resetType: reset,
      backup: { address: backupAddress, length: backupLength, chunk: 1024 },
    },
    segments: [{ address, data: f.data }],
    roadLegal: f.roadLegal,
  });

  // Последняя проверка тем же разбором, которым пакет читается при установке.
  const parsed = parsePackage(JSON.parse(JSON.stringify(pkg)));
  return parsed.ok ? { ok: true, pkg } : fail(parsed.error);
}
