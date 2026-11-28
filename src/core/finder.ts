// Поиск и проверка файлов (прошивки, кодирование, русификация, приложения) из интернета.
// Приложение ничего не ставит само: файл сначала скачивается в карантин, проверяется, и только после подтверждения принимается.

export type Trust = "official" | "store" | "community" | "filehost" | "unknown";

export type UrlAssessment = { host: string; trust: Trust; label: string; advice: string };

const OFFICIAL = [
  "chery.cn", "cheryinternational.com", "chery.ru", "exeedcars.com", "omodaauto.com", "jaecoo.com",
  "geely.com", "geely.cn", "geelyauto.com", "zeekrlife.com", "lynkco.com",
  "haval.ru", "haval-global.com", "gwm-global.com", "gwm.ru", "tank.com.cn",
  "changan.com.cn", "changaneurope.com", "changan.ru", "byd.com", "gac-motor.com", "gacmotor.com",
  "toyota.com", "toyota-europe.com", "toyota.ru", "lexus.com", "honda.com", "hyundai.com", "kia.com", "genesis.com",
  "volkswagen.com", "vw.com", "audi.com", "skoda-auto.com", "seat.com", "cupraofficial.com", "porsche.com",
  "bmw.com", "mini.com", "mercedes-benz.com", "ford.com", "mazda.com", "nissan-global.com", "mitsubishi-motors.com",
  "subaru.com", "suzuki.com", "volvocars.com", "renault.com", "peugeot.com", "citroen.com", "opel.com", "stellantis.com",
  "tesla.com", "lada.ru", "avtovaz.ru", "uaz.ru", "gaz.ru", "kamaz.ru",
];
const STORES = ["rustore.ru", "apps.rustore.ru", "play.google.com", "f-droid.org", "apps.apple.com", "apps.microsoft.com", "videolan.org", "yandex.ru", "2gis.ru", "2gis.com"];
const COMMUNITY = ["github.com", "gitlab.com", "xda-developers.com", "4pda.to", "4pda.ru", "drive2.ru", "drive2.com", "reddit.com", "youtube.com", "habr.com", "wikipedia.org", "forum.ru"];
const FILEHOSTS = ["mega.nz", "mediafire.com", "drive.google.com", "docs.google.com", "dropbox.com", "yadi.sk", "disk.yandex.ru", "disk.yandex.com", "1drv.ms", "onedrive.live.com", "sendspace.com", "gofile.io", "pixeldrain.com", "anonfiles.com", "t.me", "telegram.me", "cdn.discordapp.com", "discord.com", "zippyshare.com", "uploaded.net", "turbobit.net", "depositfiles.com"];

const matches = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

/** Оценка адреса по домену: чьё это, можно ли доверять. Доверие по домену не гарантия: смотрите и на сам файл. */
export function classifyUrl(raw: string): UrlAssessment {
  let host = "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return { host: u.host, trust: "unknown", label: "Небезопасный адрес (не https)", advice: "Адрес без шифрования: файл мог быть подменён по пути. Не скачивайте." };
    host = u.hostname.toLowerCase();
  } catch {
    return { host: "", trust: "unknown", label: "Некорректный адрес", advice: "Не удалось разобрать адрес." };
  }
  if (matches(host, OFFICIAL)) return { host, trust: "official", label: "Сайт производителя", advice: "Домен принадлежит производителю. Всё равно сверьте модель, год и версию." };
  if (matches(host, STORES)) return { host, trust: "store", label: "Магазин или сайт разработчика", advice: "Приложения из магазина и с сайта разработчика безопаснее всего." };
  if (matches(host, FILEHOSTS)) return { host, trust: "filehost", label: "Файлообменник", advice: "Файл неизвестного происхождения: его мог выложить кто угодно. Принимайте только после проверки антивирусом и сверки с источником." };
  if (matches(host, COMMUNITY)) return { host, trust: "community", label: "Форум или открытый сайт", advice: "Сообщество: файлы бывают хорошие, но без гарантий. Проверьте отзывы и совпадение версии." };
  return { host, trust: "unknown", label: "Неизвестный сайт", advice: "Источник не известен приложению. Будьте осторожны, проверьте файл антивирусом." };
}

export type SearchKind = "firmware" | "russify" | "apps" | "headunit";

/** Поисковые запросы для выбранной машины: без VIN и персональных данных, только марка, модель и год. */
export function buildQueries(kind: SearchKind, car: { make: string; model?: string; year?: number | null }): string[] {
  const name = [car.make, car.model, car.year ? String(car.year) : ""].filter(Boolean).join(" ");
  switch (kind) {
    case "firmware":
      return [`${name} firmware update official download`, `${name} прошивка блока официальное обновление`, `${name} ECU coding options`];
    case "russify":
      return [`${name} русификация магнитолы русский язык`, `${name} как включить русский язык головное устройство`, `${name} russian language head unit update`];
    case "apps":
      return [`${name} установка приложений магнитола apk`, `${name} head unit install apk developer options`, `${name} Яндекс Навигатор магнитола установка`];
    case "headunit":
      return [`${name} обновление магнитолы с флешки официальное`, `${name} infotainment software update USB official`, `${name} head unit firmware download`];
  }
}

export const ALLOWED_EXT = ["apk", "zip", "bin", "hex", "s19", "srec", "mot", "pdf", "afpkg", "json", "7z", "rar", "img", "cab", "txt"] as const;
export const BLOCKED_EXT = ["exe", "msi", "bat", "cmd", "ps1", "vbs", "js", "jse", "scr", "dll", "com", "lnk", "jar", "sh", "reg", "hta"] as const;

/** Расширение из имени: разрешено ли такое скачивать. */
export function extVerdict(name: string): { ok: boolean; ext: string; reason?: string } {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if ((BLOCKED_EXT as readonly string[]).includes(ext)) return { ok: false, ext, reason: `Файлы .${ext} запускают программы на компьютере: скачивание запрещено.` };
  if (ext && !(ALLOWED_EXT as readonly string[]).includes(ext) && name.includes(".")) return { ok: false, ext, reason: `Тип .${ext} не из списка разрешённых (apk, zip, bin, pdf, afpkg и подобные).` };
  return { ok: true, ext };
}

export const TRUST_TEXT: Record<Trust, string> = {
  official: "🟢 Сайт производителя",
  store: "🔵 Магазин / разработчик",
  community: "🟡 Форум / сообщество",
  filehost: "🔴 Файлообменник",
  unknown: "🔴 Неизвестный сайт",
};
