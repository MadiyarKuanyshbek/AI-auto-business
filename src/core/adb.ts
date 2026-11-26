// Установка приложений на магнитолу по Wi-Fi через ADB (Android Debug Bridge).
// Работает только там, где производитель оставил ADB открытым: Android-магнитолы, внешние Android-боксы,
// часть систем после включения меню разработчика. На закрытых заводских системах подключение не удастся.

export type AdbDevice = { id: string; state: string };

/** Адрес магнитолы: IPv4 и порт (по умолчанию 5555). */
export function parseAddress(raw: string): { ok: true; address: string } | { ok: false; error: string } {
  const t = raw.trim();
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/.exec(t);
  if (!m) return { ok: false, error: "Введите адрес вида 192.168.1.50 или 192.168.1.50:5555" };
  if ([m[1], m[2], m[3], m[4]].some((x) => Number(x) > 255)) return { ok: false, error: "В адресе число больше 255" };
  const port = m[5] ? Number(m[5]) : 5555;
  if (port < 1 || port > 65535) return { ok: false, error: "Порт должен быть от 1 до 65535" };
  return { ok: true, address: `${m[1]}.${m[2]}.${m[3]}.${m[4]}:${port}` };
}

/** Разбор вывода `adb devices`. */
export function parseDevices(out: string): AdbDevice[] {
  return out
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length >= 2 && p[0] && !p[0].startsWith("*"))
    .map((p) => ({ id: p[0], state: p[1] }));
}

/** Разбор вывода `adb shell pm list packages -3` (сторонние приложения). */
export function parsePackages(out: string): string[] {
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("package:"))
    .map((l) => l.slice("package:".length))
    .sort();
}

/** Имя пакета Android: латиница, цифры, точки и подчёркивания. */
export function validPackageName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(name);
}

/** Понятное объяснение типичных ответов adb. */
export function explainAdbError(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("unauthorized")) return "Магнитола не разрешила подключение: подтвердите запрос «Разрешить отладку» на её экране.";
  if (t.includes("refused") || t.includes("10061")) return "Магнитола отказала в подключении: ADB по Wi-Fi выключен или закрыт производителем.";
  if (t.includes("timed out") || t.includes("10060") || t.includes("no route")) return "Магнитола не отвечает. Проверьте, что ноутбук и магнитола в одной сети и адрес верный.";
  if (t.includes("install_failed_already_exists")) return "Это приложение уже установлено: удалите старое или используйте обновление.";
  if (t.includes("install_failed_older_sdk")) return "Приложение не подходит к версии Android этой магнитолы.";
  if (t.includes("install_failed_user_restricted") || t.includes("install_failed_verification")) return "Система магнитолы запретила установку: она закрыта производителем.";
  if (t.includes("more than one")) return "Подключено несколько устройств: оставьте одно.";
  if (t.includes("no devices") || t.includes("not found")) return "Магнитола не подключена. Нажмите «Подключиться».";
  return text.trim().split(/\r?\n/).slice(-1)[0] || "Неизвестная ошибка adb";
}

/** Приложения, которые чаще всего ставят при русификации. Ссылки только на официальные страницы разработчиков. */
export const RECOMMENDED_APPS: { name: string; purpose: string; url: string }[] = [
  { name: "Яндекс Навигатор", purpose: "Навигация и пробки на русском", url: "https://yandex.ru/navi" },
  { name: "2ГИС", purpose: "Карты и поиск организаций, работает без интернета", url: "https://2gis.ru/android" },
  { name: "Яндекс Музыка", purpose: "Музыка и подкасты", url: "https://music.yandex.ru" },
  { name: "VLC", purpose: "Воспроизведение видео и аудио из файлов", url: "https://www.videolan.org/vlc/download-android.html" },
];

export const LANGUAGE_HINT =
  "Язык: Настройки → Система → Язык (если русского нет в списке, на магнитолу ставят приложение для смены языка, а на закрытых системах язык меняет только производитель обновлением).";
