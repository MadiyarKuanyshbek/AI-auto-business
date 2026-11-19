import type { VehicleScan, ScannedEcu } from "./scanner";

// ───────────── Семейства блоков управления ─────────────

export type EcuFamily = {
  id: string;
  name: string;
  vendor: string;
  kind: "diesel" | "petrol" | "transmission" | "other";
  /** Как обычно прошиваются блоки этого семейства. Ориентир, а не гарантия — проверяйте по конкретному блоку. */
  typicalFlash: ("obd" | "bench" | "boot")[];
  notes: string;
};

type FamilyRule = { family: EcuFamily; test: (e: ScannedEcu, vendorText: string, allText: string) => boolean };

const FAMILIES: Record<string, EcuFamily> = {
  edc17: { id: "bosch-edc17", name: "Bosch EDC17", vendor: "Bosch", kind: "diesel", typicalFlash: ["obd", "boot", "bench"], notes: "Дизельный блок. У разных ревизий (C46, C64, CP20…) разная защита: часть читается по OBD, часть только через BOOT/BENCH." },
  med17: { id: "bosch-med17", name: "Bosch MED17 / ME17", vendor: "Bosch", kind: "petrol", typicalFlash: ["obd", "boot"], notes: "Бензиновый блок с прямым впрыском. Много ревизий; контрольные суммы и защита зависят от версии ПО." },
  mg1: { id: "bosch-mg1-md1", name: "Bosch MG1 / MD1", vendor: "Bosch", kind: "other", typicalFlash: ["boot", "bench"], notes: "Новое поколение (2015+). Усиленная защита, чаще требует работы на столе." },
  simos: { id: "simos", name: "Continental/Siemens Simos", vendor: "Continental", kind: "petrol", typicalFlash: ["obd", "boot"], notes: "Блоки группы VAG. Защита зависит от версии (Simos 18 и новее строже)." },
  denso: { id: "denso", name: "Denso ECM", vendor: "Denso", kind: "other", typicalFlash: ["obd", "boot"], notes: "Блоки Toyota/Lexus/Mazda/Subaru и др. Кодирование и защита сильно различаются по годам." },
  dq250: { id: "dsg-dq", name: "Мехатроник DSG (DQ250/DQ200/DL501)", vendor: "VAG", kind: "transmission", typicalFlash: ["obd", "bench"], notes: "Блок коробки. Прошивка TCU меняет логику переключений и допустимый момент; ошибок почти не прощает." },
  zf8: { id: "zf-8hp", name: "ZF 8HP", vendor: "ZF", kind: "transmission", typicalFlash: ["obd"], notes: "Автомат ZF. Адаптации и обновление ПО возможны по OBD у ряда версий." },
  generic: { id: "generic", name: "Неопознанный блок", vendor: "—", kind: "other", typicalFlash: [], notes: "Семейство не распознано — нужен ручной разбор." },
};

const RULES: FamilyRule[] = [
  { family: FAMILIES.edc17, test: (e, v, a) => /edc17/.test(a) || (/bosch/.test(v) && /^0281/.test(e.ident.supplierHardwareNumber ?? e.ident.hardwareNumber ?? "")) },
  { family: FAMILIES.med17, test: (e, v, a) => /med17|me17|med9/.test(a) || (/bosch/.test(v) && /^0261/.test(e.ident.supplierHardwareNumber ?? e.ident.hardwareNumber ?? "")) },
  { family: FAMILIES.mg1, test: (_e, _v, a) => /mg1|md1/.test(a) },
  { family: FAMILIES.simos, test: (_e, _v, a) => /simos/.test(a) },
  { family: FAMILIES.dq250, test: (_e, _v, a) => /dq250|dq200|dl501|dq381|mechatronic/.test(a) },
  { family: FAMILIES.zf8, test: (_e, _v, a) => /ga8hp|8hp/.test(a) },
  { family: FAMILIES.denso, test: (_e, v) => /denso/.test(v) },
];

export function identifyFamily(ecu: ScannedEcu): EcuFamily {
  const vendorText = (ecu.ident.supplierId ?? "").toLowerCase();
  const all = Object.values(ecu.ident).join(" ").toLowerCase() + " " + ecu.name.toLowerCase();
  return RULES.find((r) => r.test(ecu, vendorText, all))?.family ?? FAMILIES.generic;
}

// ───────────── Каталог прошивок и доработок ─────────────

export type CatalogCategory = "performance" | "economy" | "reliability" | "comfort" | "diagnostics" | "transmission";

export type CatalogItem = {
  id: string;
  title: string;
  category: CatalogCategory;
  summary: string;
  benefits: string[];
  risks: string[];
  /** Условия совместимости. Любое сработавшее даёт совпадение; чем точнее — тем выше уверенность. */
  compat: {
    softwareNumbers?: string[]; // точные номера ПО/калибровки
    softwarePrefixes?: string[];
    familyIds?: string[];
    makes?: string[];
    /** Подстроки названий моделей (например "Golf", "Camry"). Пусто — подходит любая модель марки. */
    models?: string[];
  };
  /** Идентификатор файла у партнёра/в хранилище. Без него позиция — только описание, прошить нельзя. */
  fileRef?: string;
  fileSha256?: string;
  /** demo — пример для показа; beta — ещё проверяется; verified — проверено на стенде/авто. */
  status: "demo" | "beta" | "verified";
  /** Подходит ли для дорог общего пользования без нарушения норм выбросов (заполняет автор позиции). */
  roadLegal: boolean;
  priceKzt?: number;
};

export const LEGAL_NOTICE =
  "Изменение калибровок блока управления может влиять на выбросы, ресурс агрегатов и гарантию. Приложение не включает позиции, отключающие системы очистки выхлопа. Ответственность за соответствие требованиям закона и согласие владельца авто лежит на исполнителе.";

/** Примерный каталог для демонстрации. НЕ содержит файлов прошивок — реальные позиции загружаются из хранилища. */
export const DEMO_CATALOG: CatalogItem[] = [
  {
    id: "demo-edc17-stage1",
    title: "Stage 1: оптимизация мощности и крутящего момента (пример)",
    category: "performance",
    summary: "Корректировка карт наддува и впрыска без замены железа. Пример позиции каталога.",
    benefits: ["Рост момента в средней зоне оборотов", "Более отзывчивая педаль"],
    risks: ["Повышенная нагрузка на сцепление и коробку", "Возможна потеря гарантии"],
    compat: { familyIds: ["bosch-edc17"], softwarePrefixes: ["1037"] },
    status: "demo",
    roadLegal: true,
    priceKzt: 90000,
  },
  {
    id: "demo-dsg-shift",
    title: "Оптимизация логики переключений DSG (пример)",
    category: "transmission",
    summary: "Более быстрые переключения и корректный момент давления в пакетах.",
    benefits: ["Чётче переключения", "Меньше пробуксовок"],
    risks: ["Ускоренный износ при форсированном двигателе"],
    compat: { familyIds: ["dsg-dq"], makes: ["Volkswagen", "Audi", "Škoda", "SEAT"] },
    status: "demo",
    roadLegal: true,
    priceKzt: 60000,
  },
  {
    id: "demo-economy",
    title: "Эко-калибровка расхода топлива (пример)",
    category: "economy",
    summary: "Сглаживание характеристик педали и режимов холостого хода.",
    benefits: ["Снижение расхода в смешанном цикле"],
    risks: ["Менее острая реакция на педаль"],
    compat: { familyIds: ["denso", "bosch-med17"] },
    status: "demo",
    roadLegal: true,
    priceKzt: 40000,
  },
];

export type Confidence = "exact" | "family";

export type CatalogMatch = { item: CatalogItem; ecu: ScannedEcu; confidence: Confidence; reason: string };

function softwareIds(e: ScannedEcu): string[] {
  const { softwareNumber, supplierSoftwareNumber, softwareVersion, sparePartNumber } = e.ident;
  return [softwareNumber, supplierSoftwareNumber, softwareVersion, sparePartNumber].filter((v): v is string => !!v);
}

export function matchCatalog(scan: VehicleScan, catalog: CatalogItem[]): CatalogMatch[] {
  const make = (scan.vinOnline?.make ?? scan.vinInfo?.make ?? "").toLowerCase();
  const out: CatalogMatch[] = [];
  for (const ecu of scan.ecus) {
    const family = identifyFamily(ecu);
    const sw = softwareIds(ecu).map((s) => s.toUpperCase());
    for (const item of catalog) {
      const c = item.compat;
      if (c.softwareNumbers?.some((n) => sw.includes(n.toUpperCase()))) {
        out.push({ item, ecu, confidence: "exact", reason: "Совпал номер ПО блока" });
        continue;
      }
      const prefixOk = c.softwarePrefixes?.some((p) => sw.some((s) => s.startsWith(p.toUpperCase())));
      const familyOk = c.familyIds?.includes(family.id);
      const makeOk = !c.makes?.length || c.makes.some((m) => make.includes(m.toLowerCase()));
      if (familyOk && makeOk) {
        out.push({ item, ecu, confidence: "family", reason: `Семейство блока: ${family.name}${prefixOk ? ", префикс ПО совпал" : ""}` });
      }
    }
  }
  const order: Record<Confidence, number> = { exact: 0, family: 1 };
  return out.sort((a, b) => order[a.confidence] - order[b.confidence]);
}

/** Проверка JSON каталога, пришедшего с сервера или из файла: не доверяем форме данных. */
export function parseCatalog(json: unknown): CatalogItem[] {
  if (!Array.isArray(json)) return [];
  const categories = new Set(["performance", "economy", "reliability", "comfort", "diagnostics", "transmission"]);
  const statuses = new Set(["demo", "beta", "verified"]);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const items: CatalogItem[] = [];
  for (const raw of json) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const compat = (r.compat ?? {}) as Record<string, unknown>;
    if (!str(r.id) || !str(r.title) || !categories.has(str(r.category)) || !statuses.has(str(r.status))) continue;
    items.push({
      id: str(r.id),
      title: str(r.title),
      category: str(r.category) as CatalogCategory,
      summary: str(r.summary),
      benefits: strs(r.benefits),
      risks: strs(r.risks),
      compat: {
        softwareNumbers: strs(compat.softwareNumbers),
        softwarePrefixes: strs(compat.softwarePrefixes),
        familyIds: strs(compat.familyIds),
        makes: strs(compat.makes),
        models: strs(compat.models),
      },
      fileRef: str(r.fileRef) || undefined,
      fileSha256: str(r.fileSha256) || undefined,
      status: str(r.status) as CatalogItem["status"],
      roadLegal: r.roadLegal === true,
      priceKzt: typeof r.priceKzt === "number" ? r.priceKzt : undefined,
    });
  }
  return items;
}

// ───────────── Советы и предполётные замечания ─────────────

export type Advisory = { level: "info" | "warn" | "stop"; text: string };

export function analyzeScan(scan: VehicleScan): Advisory[] {
  const out: Advisory[] = [];
  const v = scan.adapter.voltage;
  if (v !== null && v < 12.2) out.push({ level: "warn", text: `Напряжение ${v.toFixed(1)} В: для прошивки нужно не меньше 12,5 В (лучше зарядное устройство).` });
  if (scan.dtcs.length > 0) {
    out.push({
      level: "warn",
      text: `Есть коды неисправностей (${scan.dtcs.map((d) => d.code).join(", ")}). Перед любой доработкой нужно устранить причину, иначе настройка закрепит неисправность.`,
    });
  }
  if (scan.dtcs.some((d) => d.code === "P0299")) out.push({ level: "info", text: "P0299 (недобор наддува): проверьте шланги, вакуум, актуатор турбины до тюнинга." });
  if (scan.dtcs.some((d) => d.code === "P0420")) out.push({ level: "info", text: "P0420: износ катализатора. Нужна диагностика, а не отключение." });
  if (scan.ecus.some((e) => e.refused > 0)) out.push({ level: "info", text: "Часть блоков не отдала идентификаторы (защита). Для них точный номер ПО может быть недоступен по OBD." });
  if (!scan.vin) out.push({ level: "warn", text: "VIN не получен: идентификация авто неполная, введите его вручную." });
  if (scan.vinInfo && !scan.vinInfo.valid) out.push({ level: "stop", text: scan.vinInfo.problem ?? "VIN некорректен" });
  if (scan.ecus.length === 0) out.push({ level: "warn", text: "Ни один блок не ответил на UDS-запросы по стандартным адресам. У авто может быть другой протокол (K-Line или расширенный CAN)." });
  return out;
}
