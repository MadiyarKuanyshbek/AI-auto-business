import type { Car } from "./cars";

// ───────────── Какие экраны есть в автомобиле ─────────────

export type TrimLevel = "base" | "mid" | "top";
export const TRIM_LABEL: Record<TrimLevel, string> = { base: "Базовая", mid: "Средняя", top: "Топ" };

export type DisplayProfile = {
  cluster: "analog" | "hybrid" | "digital" | "none";
  clusterInch: number | null;
  center: "none" | "small" | "large";
  centerInch: number | null;
  hud: boolean;
  ambient: boolean;
};

const PREMIUM = new Set([
  "BMW", "Mercedes-Benz", "Audi", "Lexus", "Genesis", "Porsche", "Land Rover", "Volvo", "Jaguar", "Cadillac", "Infiniti", "Maserati",
  "Bentley", "Rolls-Royce", "Lamborghini", "Ferrari", "Aston Martin", "Li", "Zeekr", "Hongqi", "Mini", "Tank",
]);
const BUDGET = new Set(["Lada", "UAZ", "GAZ", "Daewoo", "Ravon", "Lifan"]);
const NEW_CHINESE = new Set(["Chery", "Exeed", "Omoda", "Jetour", "Geely", "Haval", "Changan", "BYD", "Great Wall", "Kaiyi", "JAC", "FAW", "DongFeng", "Zeekr", "Li", "Tank", "Hongqi"]);

/**
 * Ориентировочный состав экранов по марке, году и комплектации. Это не данные производителя:
 * правила выведены из типичных поколений (когда в классе появились цифровые панели, большие экраны, проекция).
 * Для точной информации по конкретной комплектации сверяйтесь с VIN и каталогом производителя.
 */
export function profileFor(car: Car, trim: TrimLevel): DisplayProfile {
  const ref = Math.min(car.to ?? 2026, car.from + 4);
  const premium = PREMIUM.has(car.make);
  const chinese = NEW_CHINESE.has(car.make);
  const rank = trim === "top" ? 2 : trim === "mid" ? 1 : 0;

  if (car.make === "Tesla") {
    return { cluster: "none", clusterInch: null, center: "large", centerInch: 15, hud: false, ambient: true };
  }

  // Годы указаны для комплектаций [топ, средняя, базовая]: чем богаче комплектация, тем раньше появляется экран.
  const pick = (years: [number, number, number]) => years[2 - rank];
  const budget = BUDGET.has(car.make);

  const digitalFrom = budget ? 2030 : premium ? pick([2015, 2018, 2021]) : chinese ? pick([2019, 2020, 2021]) : pick([2019, 2022, 2025]);
  const hybridFrom = budget ? (rank === 2 ? 2022 : 2030) : premium ? 2010 : rank >= 1 ? 2010 : 2016;
  const cluster: DisplayProfile["cluster"] = ref >= digitalFrom ? "digital" : ref >= hybridFrom ? "hybrid" : "analog";
  const clusterInch = cluster === "digital" ? (premium && ref >= 2020 ? 12.3 : ref >= 2021 ? 10.25 : 8) : cluster === "hybrid" ? 4.2 : null;

  const largeFrom = budget ? 2030 : premium ? pick([2016, 2017, 2019]) : chinese ? 2019 : pick([2019, 2021, 2023]);
  const smallFrom = budget ? (rank === 2 ? 2014 : 2018) : rank === 0 ? 2013 : 2009;
  const center: DisplayProfile["center"] = ref >= largeFrom ? "large" : ref >= smallFrom ? "small" : "none";
  const centerInch = center === "large" ? (premium ? 12.3 : ref >= 2021 ? 10.25 : 9) : center === "small" ? 7 : null;

  const hud = (premium && rank >= 1 && ref >= 2014) || (!premium && rank === 2 && ref >= 2018) || (chinese && rank === 2 && ref >= 2021);
  const ambient = (premium && rank >= 1 && ref >= 2012) || (!premium && rank === 2 && ref >= 2019) || (chinese && rank >= 1 && ref >= 2020);
  return { cluster, clusterInch, center, centerInch, hud, ambient };
}

export function describeProfile(p: DisplayProfile): string[] {
  const out: string[] = [];
  out.push(
    p.cluster === "none"
      ? "Приборной панели нет: всё на центральном экране"
      : p.cluster === "digital"
        ? `Приборная панель: цифровая ${p.clusterInch}″`
        : p.cluster === "hybrid"
          ? `Приборная панель: аналоговые шкалы и цветной дисплей ${p.clusterInch}″`
          : "Приборная панель: аналоговая (менять нечего)",
  );
  out.push(p.center === "none" ? "Центральный экран: нет" : `Центральный экран: ${p.centerInch}″ (${p.center === "large" ? "большой" : "малый"})`);
  out.push(p.hud ? "Проекция на стекло (HUD): есть" : "Проекция на стекло (HUD): нет");
  out.push(p.ambient ? "Контурная подсветка салона: есть" : "Контурная подсветка салона: нет");
  return out;
}

// ───────────── Темы интерфейса ─────────────

export type ThemeId = "sport" | "minimal" | "classic" | "eco" | "night" | "carbon" | "retro" | "race" | "navfull" | "welcome" | "ambient" | "hud";
export type ThemeTarget = "cluster" | "center" | "ambient" | "hud";

export type InterfaceTheme = {
  id: ThemeId;
  name: string;
  target: ThemeTarget;
  /** Что именно делает тема: показывается рядом с превью. */
  summary: string;
  /** Что изменится на экране после установки. */
  changes: string[];
  palette: { bg: string; panel: string; accent: string; text: string; muted: string };
  gauge: "arc" | "bar" | "analog" | "minimal" | "map" | "none";
  /** Какой блок автомобиля нужно прошивать/кодировать. */
  ecu: string;
  risk: string;
};

export const THEMES: InterfaceTheme[] = [
  {
    id: "sport", name: "Спорт: красный тахометр", target: "cluster",
    summary: "Приборная панель в спортивном стиле: дуговые шкалы, красная зона оборотов, крупная скорость.",
    changes: ["Шкала оборотов меняется на дугу с красной зоной", "Скорость показывается крупными цифрами", "Меняется цвет акцентов на красный", "Добавляется индикатор переключения передач"],
    palette: { bg: "#0A0A0F", panel: "#14141C", accent: "#FF3B30", text: "#FFFFFF", muted: "#7A7A88" }, gauge: "arc",
    ecu: "Панель приборов", risk: "Низкий: меняется только отображение, привод и безопасность не затрагиваются.",
  },
  {
    id: "race", name: "Гоночный: линейный тахометр", target: "cluster",
    summary: "Горизонтальная шкала оборотов вверху панели, как в гоночных автомобилях.",
    changes: ["Тахометр становится линейной шкалой сверху", "Показ температуры масла и наддува в углах", "Цвет шкалы переходит из зелёного в красный"],
    palette: { bg: "#050709", panel: "#10141A", accent: "#FFD60A", text: "#F5F5F5", muted: "#6B7280" }, gauge: "bar",
    ecu: "Панель приборов", risk: "Низкий: только отображение.",
  },
  {
    id: "minimal", name: "Минимализм", target: "cluster",
    summary: "Только скорость и самое нужное, без лишних шкал.",
    changes: ["Остаются скорость и передача", "Убираются второстепенные виджеты", "Чёрно-белая гамма без цветных акцентов"],
    palette: { bg: "#000000", panel: "#0C0C0C", accent: "#FFFFFF", text: "#FFFFFF", muted: "#666666" }, gauge: "minimal",
    ecu: "Панель приборов", risk: "Низкий: только отображение.",
  },
  {
    id: "classic", name: "Классика: аналоговые стрелки", target: "cluster",
    summary: "Привычные круглые шкалы со стрелками на цифровой панели.",
    changes: ["Две круглые шкалы со стрелками", "Тёплая подсветка цифр", "В центре бортовой компьютер"],
    palette: { bg: "#0D0B08", panel: "#1A1610", accent: "#E8B04B", text: "#F3E9D2", muted: "#8C7B5A" }, gauge: "analog",
    ecu: "Панель приборов", risk: "Низкий: только отображение.",
  },
  {
    id: "eco", name: "Эко: экономичная езда", target: "cluster",
    summary: "Синяя гамма и подсказки по экономичной езде вместо тахометра.",
    changes: ["Показывается мгновенный и средний расход", "Подсказки по плавности педали", "Синяя подсветка вместо красной"],
    palette: { bg: "#06121A", panel: "#0E2230", accent: "#2DD4FF", text: "#E6F7FF", muted: "#5E8CA3" }, gauge: "arc",
    ecu: "Панель приборов", risk: "Низкий: только отображение.",
  },
  {
    id: "night", name: "Ночной режим", target: "cluster",
    summary: "Приглушённая панель, чтобы не слепить ночью.",
    changes: ["Яркость и контраст снижены", "Тёмно-янтарные цифры", "Скрываются яркие элементы"],
    palette: { bg: "#050403", panel: "#0E0B07", accent: "#B8651B", text: "#D9A066", muted: "#5C4026" }, gauge: "minimal",
    ecu: "Панель приборов", risk: "Низкий: только отображение.",
  },
  {
    id: "carbon", name: "Карбон", target: "cluster",
    summary: "Фон под карбон и контрастные красные шкалы.",
    changes: ["Текстура карбона на фоне панели", "Красные акценты на шкалах", "Увеличенный шрифт скорости"],
    palette: { bg: "#0B0B0D", panel: "#17171B", accent: "#E5322D", text: "#FFFFFF", muted: "#8A8A93" }, gauge: "arc",
    ecu: "Панель приборов", risk: "Низкий: только отображение.",
  },
  {
    id: "retro", name: "Ретро: янтарные шкалы", target: "cluster",
    summary: "Стиль приборов 90-х: янтарные шкалы и тонкие стрелки.",
    changes: ["Янтарная подсветка шкал", "Тонкие стрелки", "Винтажный шрифт цифр"],
    palette: { bg: "#0A0703", panel: "#17110A", accent: "#FFA21F", text: "#FFD9A0", muted: "#8A6A3A" }, gauge: "analog",
    ecu: "Панель приборов", risk: "Низкий: только отображение.",
  },
  {
    id: "navfull", name: "Навигация на панели", target: "cluster",
    summary: "Карта навигатора на всю приборную панель между шкалами.",
    changes: ["Карта и маршрут между шкалами", "Шкалы уменьшаются по краям", "Подсказки поворотов крупно"],
    palette: { bg: "#06090F", panel: "#101826", accent: "#3B82F6", text: "#EAF1FF", muted: "#6B7FA3" }, gauge: "map",
    ecu: "Панель приборов", risk: "Низкий: только отображение; нужен навигатор в авто.",
  },
  {
    id: "welcome", name: "Анимация приветствия", target: "center",
    summary: "Своя заставка с логотипом при включении зажигания.",
    changes: ["Новая анимация при запуске", "Логотип марки и подсветка", "Длительность около 4 секунд"],
    palette: { bg: "#05070C", panel: "#0F1422", accent: "#7C9CFF", text: "#FFFFFF", muted: "#6B7794" }, gauge: "none",
    ecu: "Мультимедиа / панель приборов", risk: "Низкий: влияет только на заставку.",
  },
  {
    id: "ambient", name: "Цвет подсветки салона", target: "ambient",
    summary: "Свой цвет и режим контурной подсветки.",
    changes: ["Выбор цвета из 64 оттенков", "Режимы: постоянный, дыхание, реакция на скорость", "Синхронизация с темой экранов"],
    palette: { bg: "#0A0614", panel: "#150B26", accent: "#A855F7", text: "#F5EBFF", muted: "#8C6FB3" }, gauge: "none",
    ecu: "Блок кузова / подсветки", risk: "Низкий: влияет только на подсветку.",
  },
  {
    id: "hud", name: "Проекция: скорость и подсказки", target: "hud",
    summary: "Настройка информации на проекции: скорость, ограничения, навигация.",
    changes: ["Скорость и знак ограничения на стекле", "Стрелки навигатора", "Яркость по датчику освещённости"],
    palette: { bg: "#03110A", panel: "#071E12", accent: "#4ADE80", text: "#D9FBE6", muted: "#4C8A66" }, gauge: "minimal",
    ecu: "Проекционный дисплей (HUD)", risk: "Низкий: только отображение.",
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, InterfaceTheme>;

/** Подходит ли тема под набор экранов автомобиля. */
export function themeFits(theme: InterfaceTheme, p: DisplayProfile): { ok: boolean; reason?: string } {
  switch (theme.target) {
    case "cluster":
      if (p.cluster === "digital") return { ok: true };
      if (p.cluster === "hybrid" && ["classic", "eco", "minimal", "night"].includes(theme.id)) return { ok: true };
      return { ok: false, reason: p.cluster === "analog" ? "Аналоговая панель: менять нечего" : p.cluster === "none" ? "Нет приборной панели" : "Нужна полностью цифровая панель" };
    case "center":
      return p.center === "none" && p.cluster === "analog" ? { ok: false, reason: "Нет экранов" } : { ok: true };
    case "ambient":
      return p.ambient ? { ok: true } : { ok: false, reason: "В комплектации нет контурной подсветки" };
    case "hud":
      return p.hud ? { ok: true } : { ok: false, reason: "В комплектации нет проекции на стекло" };
  }
}

// ───────────── Файлы интерфейса для модели ─────────────

export type InterfaceFile = {
  /** Имя файла по правилам приложения. */
  fileName: string;
  theme: InterfaceTheme;
  /** mockup — макет: описание и превью есть, самого файла пока нет; ready — есть пакет в библиотеке. */
  status: "mockup" | "ready";
  /** Идентификатор готового пакета, если он есть. */
  packageId?: string;
  fits: boolean;
  reason?: string;
};

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function interfaceFileName(car: Car, theme: ThemeId): string {
  return `AF-UI-${slug(car.make)}-${slug(car.model)}-${theme}.afpkg`;
}

/** Все файлы интерфейса, возможные для выбранной модели и комплектации. */
export function interfaceFilesFor(car: Car, trim: TrimLevel, readyPackageIds: Record<string, string> = {}): InterfaceFile[] {
  const profile = profileFor(car, trim);
  return THEMES.map((theme) => {
    const fit = themeFits(theme, profile);
    const packageId = readyPackageIds[theme.id];
    return { fileName: interfaceFileName(car, theme.id), theme, status: packageId ? ("ready" as const) : ("mockup" as const), packageId, fits: fit.ok, reason: fit.reason };
  });
}

/** Группировка справочника: марка → модель → поколения. */
export function baseModel(model: string): string {
  const parts = model.split(" ");
  const last = parts[parts.length - 1];
  return parts.length > 1 && last.length >= 2 && /\d/.test(last) ? parts.slice(0, -1).join(" ") : model;
}

export function generationLabel(car: Car): string {
  const base = baseModel(car.model);
  const gen = car.model.slice(base.length).trim();
  return gen || "—";
}
