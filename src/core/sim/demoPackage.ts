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
  category: "engine",
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

const CLUSTER_DATA = Uint8Array.from({ length: 4096 }, (_, i) => (i * 5 + 17) & 0xff);

/** Интерфейсный пакет: тема «Классика» для панели приборов виртуального Golf. */
export const DEMO_PACKAGE_CLUSTER: FirmwarePackage = buildPackage({
  id: "demo-golf-cluster-classic",
  version: "1.0.0",
  title: "Демо: тема «Классика» для панели приборов",
  description: "Круглые шкалы со стрелками и тёплая подсветка на панели приборов. Данные ненастоящие.",
  category: "interface",
  interface: { theme: "classic" },
  target: { softwareNumbers: ["5K0920860"], txId: "7E4", vehicles: [{ make: "Volkswagen", model: "Golf", from: 2008, to: 2012 }] },
  expectedSoftwareNumber: `5K0920860-${sha256Hex(CLUSTER_DATA).slice(0, 4).toUpperCase()}`,
  procedure: {
    ...procedure,
    security: { level: 0x11, algorithm: "demo-xor-add", params: { maskHex: "33" } },
    backup: { address: 0x10000, length: 4096, chunk: 1024 },
  },
  segments: [{ address: 0x10000, data: CLUSTER_DATA }],
  roadLegal: true,
  demo: true,
});

const DATA_BMW = Uint8Array.from({ length: 8192 }, (_, i) => (i * 5 + 41) & 0xff);
const DATA_CAMRY = Uint8Array.from({ length: 8192 }, (_, i) => (i * 3 + 29) & 0xff);

/** Демо-пакет для виртуального блока двигателя BMW 320d F30. */
export const DEMO_PACKAGE_BMW: FirmwarePackage = buildPackage({
  id: "demo-bmw-f30-engine",
  version: "1.0.0",
  title: "Демо: обновление блока двигателя BMW 320d",
  description: "Пример пакета для виртуального блока двигателя: показывает установку и проверку результата. Данные ненастоящие.",
  target: { softwareNumbers: ["1037560226"], txId: "7E0", vehicles: [{ make: "BMW", model: "3 Series", from: 2011, to: 2019 }] },
  expectedSoftwareNumber: `1037560226-${sha256Hex(DATA_BMW).slice(0, 4).toUpperCase()}`,
  procedure: {
    ...procedure,
    security: { level: 0x11, algorithm: "demo-xor-add", params: { maskHex: "6C" } },
    backup: { address: 0x90000, length: 8192, chunk: 1024 },
  },
  segments: [{ address: 0x90000, data: DATA_BMW }],
  roadLegal: true,
  category: "engine",
  demo: true,
});

/** Демо-пакет для виртуального блока двигателя Toyota Camry XV70. */
export const DEMO_PACKAGE_CAMRY: FirmwarePackage = buildPackage({
  id: "demo-camry-xv70-engine",
  version: "1.0.0",
  title: "Демо: обновление блока двигателя Toyota Camry",
  description: "Пример пакета для виртуального блока двигателя: показывает установку и проверку результата. Данные ненастоящие.",
  target: { softwareNumbers: ["8966306B50"], txId: "7E0", vehicles: [{ make: "Toyota", model: "Camry", from: 2017 }] },
  expectedSoftwareNumber: `8966306B50-${sha256Hex(DATA_CAMRY).slice(0, 4).toUpperCase()}`,
  procedure: {
    ...procedure,
    security: { level: 0x11, algorithm: "demo-xor-add", params: { maskHex: "4D" } },
    backup: { address: 0xa0000, length: 8192, chunk: 1024 },
  },
  segments: [{ address: 0xa0000, data: DATA_CAMRY }],
  roadLegal: true,
  category: "engine",
  demo: true,
});

export const DEMO_PACKAGES: FirmwarePackage[] = [DEMO_PACKAGE_V1, DEMO_PACKAGE_V1_1, DEMO_PACKAGE_CLUSTER, DEMO_PACKAGE_BMW, DEMO_PACKAGE_CAMRY];
