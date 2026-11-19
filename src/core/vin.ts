// Расшифровка VIN: офлайн (производитель, страна, модельный год) + онлайн-справочник NHTSA vPIC.

const WMI: Record<string, string> = {
  WAU: "Audi", WA1: "Audi", WUA: "Audi (quattro GmbH)",
  WVW: "Volkswagen", WVG: "Volkswagen (SUV)", WV1: "Volkswagen (коммерческие)", WV2: "Volkswagen (Transporter)", "3VW": "Volkswagen (Мексика)",
  TRU: "Audi (Венгрия)", TMB: "Škoda", VSS: "SEAT", WP0: "Porsche", WP1: "Porsche (Cayenne/Macan)",
  WBA: "BMW", WBS: "BMW M", WBY: "BMW i", "5UX": "BMW (США, X-серия)", "4US": "BMW (США)",
  WDB: "Mercedes-Benz", WDC: "Mercedes-Benz (SUV)", WDD: "Mercedes-Benz", W1K: "Mercedes-Benz", W1N: "Mercedes-Benz (SUV)", WMW: "MINI",
  WF0: "Ford (Европа)", "1FA": "Ford", "1FT": "Ford (грузовики)", "1FM": "Ford (SUV)", "3FA": "Ford (Мексика)",
  VF1: "Renault", VF3: "Peugeot", VF7: "Citroën", VR1: "DS", ZFA: "Fiat", ZAR: "Alfa Romeo", ZFF: "Ferrari", ZHW: "Lamborghini", ZAM: "Maserati",
  WOL: "Opel", W0V: "Opel", SAJ: "Jaguar", SAL: "Land Rover", SCC: "Lotus", SCA: "Rolls-Royce", SCB: "Bentley", YV1: "Volvo", YS3: "Saab",
  JTD: "Toyota", JTE: "Toyota (SUV)", JTH: "Lexus", JT2: "Toyota", "2T1": "Toyota (Канада)", "4T1": "Toyota (США)", "5TD": "Toyota (США, минивэны)", "5YJ": "Tesla",
  JHM: "Honda", "1HG": "Honda (США)", "2HG": "Honda (Канада)", JN1: "Nissan", JN8: "Nissan (SUV)", "1N4": "Nissan (США)", JM1: "Mazda", JM3: "Mazda (SUV)",
  JF1: "Subaru", JF2: "Subaru (SUV)", JS3: "Suzuki", JMB: "Mitsubishi", JMY: "Mitsubishi",
  KMH: "Hyundai", KMC: "Hyundai (коммерческие)", KM8: "Hyundai (SUV)", "5NP": "Hyundai (США)", KNA: "Kia", KND: "Kia (SUV)", KNM: "Kia", "5XY": "Kia (США)",
  "1G1": "Chevrolet", "1GC": "Chevrolet (грузовики)", "1GT": "GMC", "1G6": "Cadillac", "2G1": "Chevrolet (Канада)", "3GN": "Chevrolet (Мексика)",
  "1C4": "Chrysler/Jeep/Dodge", "1J4": "Jeep", "2C3": "Chrysler (Канада)", "1B3": "Dodge",
  LFV: "Volkswagen (Китай, FAW)", LSV: "Volkswagen (Китай, SAIC)", LVS: "Ford (Китай)", LBV: "BMW (Китай)", LE4: "Mercedes (Китай)",
  LGW: "Great Wall", LJD: "Geely/Dongfeng", L6T: "Geely", LVV: "Chery", LC0: "BYD", LNB: "BAIC",
  XTA: "LADA (АвтоВАЗ)", XTT: "УАЗ", X7L: "Renault (Россия)", X9F: "Ford (Россия)", XW8: "Volkswagen (Россия)", Z8N: "Nissan (Россия)",
  Z94: "Hyundai (Россия)", XWE: "Kia/Hyundai (Калининград)", X4X: "BMW (Калининград)", XUF: "General Motors (Россия)",
  "9BW": "Volkswagen (Бразилия)", "93H": "Honda (Бразилия)", MA1: "Mahindra", MAT: "Tata", NM0: "Ford Otosan (Турция)", NMT: "Toyota (Турция)",
  U5Y: "Kia (Словакия)", TMA: "Hyundai (Чехия)", UU1: "Dacia", VNK: "Toyota (Франция)", VWV: "Volkswagen (Испания)",
};

const REGION: [RegExp, string][] = [
  [/^[1-5]/, "Северная Америка"],
  [/^[6-7]/, "Океания"],
  [/^[8-9]/, "Южная Америка"],
  [/^[A-H]/, "Африка"],
  [/^[J-R]/, "Азия"],
  [/^[S-Z]/, "Европа"],
];

const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

export type VinInfo = {
  vin: string;
  valid: boolean;
  problem?: string;
  make?: string;
  region?: string;
  modelYear?: number;
  checkDigitOk?: boolean;
};

export function cleanVin(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function checkDigit(vin: string): string {
  const values: Record<string, number> = {};
  "ABCDEFGH".split("").forEach((c, i) => (values[c] = i + 1));
  "JKLMN".split("").forEach((c, i) => (values[c] = i + 1));
  values.P = 7;
  values.R = 9;
  "STUVWXYZ".split("").forEach((c, i) => (values[c] = i + 2));
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const v = /\d/.test(ch) ? Number(ch) : (values[ch] ?? 0);
    sum += v * weights[i];
  }
  const rem = sum % 11;
  return rem === 10 ? "X" : String(rem);
}

/** Модельный год по 10-му символу. Цикл 30 лет — выбираем ближайший год в диапазоне 1981…(тек. год + 1). */
export function modelYearFromVin(vin: string, now = new Date().getFullYear()): number | undefined {
  const idx = YEAR_CODES.indexOf(vin[9]);
  if (idx < 0) return undefined;
  const candidates = [1980 + idx, 2010 + idx].filter((y) => y <= now + 1);
  return candidates.length ? Math.max(...candidates) : undefined;
}

export function decodeVinOffline(rawVin: string): VinInfo {
  const vin = cleanVin(rawVin);
  if (vin.length !== 17) return { vin, valid: false, problem: "VIN должен содержать 17 символов" };
  if (/[IOQ]/.test(vin)) return { vin, valid: false, problem: "В VIN не бывает букв I, O, Q" };

  const wmi = vin.slice(0, 3);
  const make = WMI[wmi] ?? WMI[`${vin[0]}${vin[1]}${vin[2]}`];
  const region = REGION.find(([re]) => re.test(vin[0]))?.[1];
  const isNorthAmerica = /^[1-5]/.test(vin[0]);
  // Контрольная цифра обязательна только в Северной Америке — в остальных регионах не проверяем строго.
  const checkDigitOk = checkDigit(vin) === vin[8];

  return {
    vin,
    valid: !isNorthAmerica || checkDigitOk,
    problem: isNorthAmerica && !checkDigitOk ? "Контрольная цифра VIN не сходится" : undefined,
    make,
    region,
    modelYear: modelYearFromVin(vin),
    checkDigitOk,
  };
}

export type VinOnline = {
  make?: string;
  model?: string;
  modelYear?: number;
  trim?: string;
  engine?: string;
  displacementL?: number;
  cylinders?: number;
  fuel?: string;
  turbo?: string;
  drive?: string;
  transmission?: string;
  bodyClass?: string;
  plantCountry?: string;
};

/** NHTSA vPIC. Лучше всего знает авто для США; для остальных вернёт частичные данные. Ошибки сети не критичны. */
export async function decodeVinOnline(vin: string, fetchImpl: typeof fetch = fetch): Promise<VinOnline | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetchImpl(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!response.ok) return null;
    const json = (await response.json()) as { Results?: Record<string, string>[] };
    const r = json.Results?.[0];
    if (!r) return null;
    const val = (k: string) => (r[k] && r[k] !== "Not Applicable" ? r[k] : undefined);
    const num = (k: string) => {
      const n = Number(val(k));
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    return {
      make: val("Make"),
      model: val("Model"),
      modelYear: num("ModelYear"),
      trim: val("Trim"),
      engine: [val("EngineModel"), val("EngineConfiguration")].filter(Boolean).join(" ") || undefined,
      displacementL: num("DisplacementL"),
      cylinders: num("EngineCylinders"),
      fuel: val("FuelTypePrimary"),
      turbo: val("Turbo"),
      drive: val("DriveType"),
      transmission: val("TransmissionStyle"),
      bodyClass: val("BodyClass"),
      plantCountry: val("PlantCountry"),
    };
  } catch {
    return null;
  }
}
