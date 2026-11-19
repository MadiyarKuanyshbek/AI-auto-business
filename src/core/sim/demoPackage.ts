import { buildPackage, type FirmwarePackage } from "../package";
import { sha256Hex } from "../sha256";

// Демонстрационные пакеты прошивки для ВИРТУАЛЬНОГО блока двигателя демо-Golf. В реальный автомобиль
// они ставиться не могут (пакет помечен demo), а данные внутри — просто последовательность байтов.

const PATTERN = (seed: number) => Uint8Array.from({ length: 8192 }, (_, i) => (i * 7 + seed) & 0xff);

/** Номер ПО, который виртуальный блок покажет после записи этих данных. */
const softwareAfter = (data: Uint8Array) => `1037525811-${sha256Hex(data).slice(0, 4).toUpperCase()}`;

const DATA_V1 = PATTERN(3);
const DATA_V1_1 = PATTERN(9);

const procedure = {
  kind: "uds-download" as const,
  extendedSession: 0x03,
  disableDtc: true,
  programmingSession: 0x02,
  security: { level: 0x11, algorithm: "demo-xor-add", params: { maskHex: "5A" } },
  erase: { routineId: 0xff00 },
  download: { dataFormat: 0x00, addressAndLengthFormat: 0x44 },
  check: { routineId: 0x0202 },
  resetType: 0x01,
  backup: { address: 0x80000, length: 8192, chunk: 1024 },
};

export const DEMO_PACKAGE_V1: FirmwarePackage = buildPackage({
  id: "demo-golf-stage1",
  version: "1.0.0",
  title: "Демо: Stage 1 для виртуального блока EDC17",
  description: "Пример пакета: показывает, как приложение ставит прошивку и проверяет результат. Данные ненастоящие.",
  target: { softwareNumbers: ["1037525811"], txId: "7E0", vehicles: [{ make: "Volkswagen", model: "Golf", from: 2008, to: 2012 }] },
  expectedSoftwareNumber: softwareAfter(DATA_V1),
  procedure,
  segments: [{ address: 0x80000, data: DATA_V1 }],
  roadLegal: true,
  demo: true,
});

/** Обновление того же пакета: применимо и к исходному ПО, и к уже установленной версии 1.0.0. */
export const DEMO_PACKAGE_V1_1: FirmwarePackage = buildPackage({
  id: "demo-golf-stage1",
  version: "1.1.0",
  title: "Демо: Stage 1 для виртуального блока EDC17 (обновление)",
  description: "Обновление примера: исправлена карта, новая версия номера ПО.",
  target: { softwareNumbers: ["1037525811", softwareAfter(DATA_V1)], txId: "7E0", vehicles: [{ make: "Volkswagen", model: "Golf", from: 2008, to: 2012 }] },
  expectedSoftwareNumber: softwareAfter(DATA_V1_1),
  procedure,
  segments: [{ address: 0x80000, data: DATA_V1_1 }],
  roadLegal: true,
  demo: true,
});

export const DEMO_PACKAGES: FirmwarePackage[] = [DEMO_PACKAGE_V1, DEMO_PACKAGE_V1_1];
