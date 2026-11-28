// Главный процесс настольного AutoFlash (Electron).
// Приложение — это тот же интерфейс, что и в браузере, но с настоящими возможностями ПК:
// Bluetooth LE, COM-порты (USB-кабели и спаренные Bluetooth-адаптеры) и TCP для Wi-Fi адаптеров.
const { app, BrowserWindow, ipcMain, protocol, net, shell, session, dialog } = require("electron");
const { execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const netSocket = require("node:net");
const os = require("node:os");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const WEB_ROOT = path.join(__dirname, "web");
const SELFTEST = process.argv.find((a) => a.startsWith("--selftest="))?.slice("--selftest=".length);

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// При самопроверке данные приложения лежат в отдельной папке — чистое состояние на каждый прогон.
if (SELFTEST) app.setPath("userData", path.join(SELFTEST, "userdata"));

let win = null;

// ───────────── Раздача интерфейса по app://autoflash/ (стабильное «происхождение» для localStorage) ─────────────
function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    let file = path.normalize(path.join(WEB_ROOT, rel));
    // Защита от выхода за пределы папки интерфейса (проверка по относительному пути, а не по началу строки).
    const relative = path.relative(WEB_ROOT, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return new Response("Forbidden", { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // Маршруты приложения (/vehicle, /tune…) → единая страница (SPA).
      file = path.join(WEB_ROOT, "index.html");
    }
    return net.fetch(pathToFileURL(file).toString()).then((res) => {
      // Политика безопасности: только свои скрипты, связь только со своим приложением и базой VIN (NHTSA).
      const headers = new Headers(res.headers);
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://vpic.nhtsa.dot.gov; object-src 'none'; base-uri 'none'; form-action 'none'",
      );
      return new Response(res.body, { status: res.status, headers });
    });
  });
}

// ───────────── Выбор устройств (Bluetooth, COM-порт) — через окно в самом интерфейсе ─────────────
let pendingChooser = null;

function offerDevices(kind, devices, callback) {
  pendingChooser = { kind, callback };
  win?.webContents.send("chooser:list", { kind, devices });
}

ipcMain.on("chooser:pick", (_e, { kind, id }) => {
  if (!pendingChooser || pendingChooser.kind !== kind) return;
  const { callback } = pendingChooser;
  pendingChooser = null;
  callback(id || "");
});

// ───────────── TCP для Wi-Fi адаптеров ─────────────
const sockets = new Map();
let nextSocketId = 1;

ipcMain.handle("tcp:connect", (_e, { host, port }) =>
  new Promise((resolve, reject) => {
    if (typeof host !== "string" || !/^[\w.\-:]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
      return reject(new Error("Некорректный адрес адаптера"));
    }
    // Wi-Fi адаптеры OBD всегда в локальной сети: подключения в интернет отклоняем.
    const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
    const local = m && (m[1] === "10" || m[1] === "127" || (m[1] === "192" && m[2] === "168") || (m[1] === "172" && +m[2] >= 16 && +m[2] <= 31) || (m[1] === "169" && m[2] === "254"));
    if (!local) return reject(new Error("Адаптер должен быть в локальной сети (адрес вида 192.168.x.x)"));
    const id = nextSocketId++;
    const socket = netSocket.createConnection({ host, port });
    socket.setNoDelay(true);
    socket.setTimeout(8000, () => {
      socket.destroy(new Error("Адаптер не отвечает. Подключите компьютер к Wi-Fi сети адаптера и проверьте адрес."));
    });
    socket.once("connect", () => {
      socket.setTimeout(0);
      sockets.set(id, socket);
      resolve(id);
    });
    socket.once("error", (err) => {
      if (!sockets.has(id)) reject(new Error(`Не удалось подключиться: ${err.message}`));
    });
    socket.on("data", (buf) => win?.webContents.send("tcp:data", { id, text: buf.toString("latin1") }));
    socket.on("close", () => {
      sockets.delete(id);
      win?.webContents.send("tcp:close", { id });
    });
  }),
);

ipcMain.handle("tcp:write", (_e, { id, text }) =>
  new Promise((resolve, reject) => {
    const s = sockets.get(id);
    if (!s) return reject(new Error("Нет соединения"));
    s.write(Buffer.from(String(text), "latin1"), (err) => (err ? reject(err) : resolve()));
  }),
);

ipcMain.on("tcp:close", (_e, { id }) => sockets.get(id)?.destroy());

// ───────────── Резервные копии ─────────────
function backupDir() {
  // При самопроверке копии пишем во временную папку, а не в реальные «Документы».
  const base = SELFTEST ? path.join(SELFTEST, "documents") : app.getPath("documents");
  const dir = path.join(base, "AutoFlash", "Backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Настройки приложения хранятся рядом с данными (папка пользователя).
function configFile() {
  return path.join(app.getPath("userData"), "config.json");
}
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    return {};
  }
}
function writeConfig(patch) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify({ ...readConfig(), ...patch }, null, 2), "utf8");
}

ipcMain.handle("backup:get-mirror", () => readConfig().mirrorDir || null);

// Дополнительная папка для копий: обычно папка облака (OneDrive, Google Drive, Dropbox) или сетевой диск.
ipcMain.handle("backup:choose-mirror", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Выберите папку для копий (например, OneDrive)", properties: ["openDirectory", "createDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  writeConfig({ mirrorDir: r.filePaths[0] });
  return r.filePaths[0];
});

ipcMain.handle("backup:clear-mirror", () => {
  writeConfig({ mirrorDir: null });
  return true;
});

ipcMain.handle("backup:save-as", async (_e, { json }) => {
  if (typeof json !== "string" || json.length > 50 * 1024 * 1024) throw new Error("Некорректные данные копии");
  const day = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, { title: "Сохранить копию данных", defaultPath: `autoflash-${day}.json`, filters: [{ name: "Копия AutoFlash", extensions: ["json"] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, json, "utf8");
  return r.filePath;
});

ipcMain.handle("backup:load", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Загрузить копию данных", properties: ["openFile"], filters: [{ name: "Копия AutoFlash", extensions: ["json"] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const st = fs.statSync(r.filePaths[0]);
  if (st.size > 50 * 1024 * 1024) throw new Error("Файл слишком большой");
  return fs.readFileSync(r.filePaths[0], "utf8");
});

ipcMain.handle("backup:save", (_e, { json, name }) => {
  if (typeof json !== "string" || json.length > 50 * 1024 * 1024) throw new Error("Некорректные данные копии");
  const dir = backupDir();
  const day = new Date().toISOString().slice(0, 10);
  const safeName = typeof name === "string" && /^[\w.\-]+$/.test(name) ? name : `autoflash-${day}.json`;
  const file = path.join(dir, safeName);
  fs.writeFileSync(file, json, "utf8");
  // Дополнительная копия в выбранную папку (облако или другой диск): сбой записи туда не ломает основную копию.
  const mirror = readConfig().mirrorDir;
  if (mirror) {
    try {
      fs.mkdirSync(mirror, { recursive: true });
      fs.copyFileSync(file, path.join(mirror, safeName));
    } catch {
      // папка недоступна (нет сети, диск отключён): основная копия уже записана
    }
  }
  // Храним последние 30 копий.
  const files = fs.readdirSync(dir).filter((f) => /^autoflash-.*\.json$/.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - 30))) fs.rmSync(path.join(dir, old), { force: true });
  return file;
});

ipcMain.handle("backup:open-folder", () => shell.openPath(backupDir()));

// ───────────── Bluetooth и Wi-Fi компьютера: состояние и включение ─────────────
// Используется системный интерфейс Windows (Windows.Devices.Radios) через PowerShell. Команда собирается
// только из заранее разрешённых значений.
const RADIO_PREAMBLE = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($WinRtTask, $ResultType) { $asTask = $asTaskGeneric.MakeGenericMethod($ResultType); $netTask = $asTask.Invoke($null, @($WinRtTask)); $netTask.Wait(-1) | Out-Null; $netTask.Result }
[Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
`;

function runRadio(extra) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve({ ok: false, radios: [], error: "Только Windows" });
    const script = `${RADIO_PREAMBLE}\n${extra}\n$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])\nforeach ($r in $radios) { "$($r.Kind)|$($r.State)" }`;
    const enc = Buffer.from(script, "utf16le").toString("base64");
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { timeout: 25000, windowsHide: true, encoding: "utf8" }, (err, stdout, stderr) => {
      const radios = String(stdout)
        .split(/\r?\n/)
        .map((l) => l.trim().split("|"))
        .filter((p) => p.length === 2 && (p[0] === "Bluetooth" || p[0] === "WiFi"))
        .map((p) => ({ kind: p[0], state: p[1] }));
      resolve({ ok: !err && radios.length > 0, radios, error: err ? String(stderr || err.message).slice(0, 200) : undefined });
    });
  });
}

ipcMain.handle("radio:get", () => runRadio(""));
ipcMain.handle("radio:set", (_e, { kind, on }) => {
  if (!["Bluetooth", "WiFi"].includes(kind) || typeof on !== "boolean") return { ok: false, radios: [], error: "Некорректный запрос" };
  const state = on ? "On" : "Off";
  return runRadio(`$t = $radios | Where-Object { $_.Kind -eq '${kind}' } | Select-Object -First 1\nif ($t) { Await ($t.SetStateAsync('${state}')) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null }`);
});

// ───────────── Поиск устройств в Wi-Fi сети (радар) ─────────────
// Проверяем только свою домашнюю сеть (/24 от адресов компьютера) и два порта: 35000 (Wi-Fi адаптеры OBD)
// и 5555 (ADB магнитол). Ничего не отправляем, только проверяем, открыт ли порт.
function probe(ip, port, timeout = 350) {
  return new Promise((resolve) => {
    const s = netSocket.createConnection({ host: ip, port });
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(timeout, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

ipcMain.handle("net:scan", async () => {
  const own = new Set();
  const hosts = new Set(["192.168.0.10", "192.168.4.1"]);
  if (SELFTEST) hosts.add("127.0.0.1");
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== "IPv4" || i.internal) continue;
      own.add(i.address);
      const p = i.address.split(".");
      if (!(p[0] === "10" || (p[0] === "192" && p[1] === "168") || (p[0] === "172" && Number(p[1]) >= 16 && Number(p[1]) <= 31))) continue;
      for (let n = 1; n < 255; n++) hosts.add(`${p[0]}.${p[1]}.${p[2]}.${n}`);
    }
  }
  const targets = [];
  for (const ip of hosts) if (!own.has(ip)) for (const port of [35000, 5555]) targets.push({ ip, port });
  const found = [];
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const t = targets[next++];
      if (await probe(t.ip, t.port)) found.push(t);
    }
  };
  await Promise.all(Array.from({ length: 96 }, worker));
  return found;
});

// ───────────── Библиотека приложений для магнитолы ─────────────
// Скачиваем только из заранее заданного списка официальных источников, по https, проверяем контрольную сумму
// (если разработчик её публикует) и признак APK-архива. Произвольные адреса интерфейс задать не может.
const APP_CATALOG = [
  { id: "vlc-arm64", title: "VLC для Android (64-бит, arm64)", purpose: "Видео и музыка из файлов. Для новых магнитол.", file: "VLC-Android-3.7.0-arm64-v8a.apk", url: "https://get.videolan.org/vlc-android/3.7.0/VLC-Android-3.7.0-arm64-v8a.apk", sha256Url: "https://get.videolan.org/vlc-android/3.7.0/VLC-Android-3.7.0-arm64-v8a.apk.sha256", size: "около 50 МБ" },
  { id: "vlc-armv7", title: "VLC для Android (32-бит, armv7)", purpose: "Видео и музыка из файлов. Для старых магнитол.", file: "VLC-Android-3.7.0-armeabi-v7a.apk", url: "https://get.videolan.org/vlc-android/3.7.0/VLC-Android-3.7.0-armeabi-v7a.apk", sha256Url: "https://get.videolan.org/vlc-android/3.7.0/VLC-Android-3.7.0-armeabi-v7a.apk.sha256", size: "около 47 МБ" },
  { id: "rustore", title: "RuStore (магазин приложений)", purpose: "Через него ставятся Яндекс Навигатор, 2ГИС, Яндекс Музыка.", file: "RuStore-mobile-1.114.0.3.apk", url: "https://static.rustore.ru/rustore-releases/stable/RuStore-mobile-1.114.0.3.apk", sha256Url: null, size: "около 58 МБ" },
];

function appsDir() {
  const base = SELFTEST ? path.join(SELFTEST, "documents") : app.getPath("documents");
  const dir = path.join(base, "AutoFlash", "Apps");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Ищет файл в папке приложений и во вложенных папках (раньше файлы лежали по папкам версий). */
function findApk(file) {
  const root = appsDir();
  const direct = path.join(root, file);
  if (fs.existsSync(direct)) return direct;
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (d.isDirectory()) {
      const p = path.join(root, d.name, file);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function insideAppsDir(file) {
  const rel = path.relative(appsDir(), path.resolve(String(file)));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

ipcMain.handle("apps:list", () =>
  APP_CATALOG.map((a) => {
    const p = findApk(a.file);
    return { id: a.id, title: a.title, purpose: a.purpose, size: a.size, hasChecksum: !!a.sha256Url, downloaded: !!p, file: p };
  }),
);

ipcMain.handle("apps:download", async (_e, { id }) => {
  const entry = APP_CATALOG.find((a) => a.id === id);
  if (!entry) return { ok: false, error: "Неизвестное приложение" };
  const target = path.join(appsDir(), entry.file);
  const tmp = `${target}.part`;
  try {
    let expected = null;
    if (entry.sha256Url) {
      const r = await net.fetch(entry.sha256Url);
      if (!r.ok) return { ok: false, error: `Не удалось получить контрольную сумму (${r.status})` };
      expected = (await r.text()).trim().split(/\s+/)[0].toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(expected)) return { ok: false, error: "Контрольная сумма на сайте разработчика в неожиданном виде" };
    }
    const res = await net.fetch(entry.url);
    if (!res.ok || !res.body) return { ok: false, error: `Сервер ответил ошибкой ${res.status}` };
    const hash = crypto.createHash("sha256");
    let bytes = 0;
    const out = fs.createWriteStream(tmp);
    const src = Readable.fromWeb(res.body);
    src.on("data", (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
      if (bytes > 200 * 1024 * 1024) src.destroy(new Error("Файл больше ожидаемого"));
    });
    await pipeline(src, out);
    const actual = hash.digest("hex");
    const head = Buffer.alloc(4);
    const fd = fs.openSync(tmp, "r");
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    if (head[0] !== 0x50 || head[1] !== 0x4b) throw new Error("Скачанный файл не похож на приложение (.apk)");
    if (expected && actual !== expected) throw new Error("Контрольная сумма не совпала: файл повреждён или подменён, он удалён");
    fs.renameSync(tmp, target);
    fs.writeFileSync(`${target}.sha256`, `${actual}  ${entry.file}\n`);
    return { ok: true, file: target, sha256: actual, verified: !!expected };
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("apps:choose", (_e, { file }) => {
  if (typeof file !== "string" || !insideAppsDir(file) || !file.toLowerCase().endsWith(".apk") || !fs.existsSync(file)) return null;
  pickedApk = file;
  return path.basename(file);
});

ipcMain.handle("apps:open-folder", () => shell.openPath(appsDir()));

// Windows умеет отправлять файлы по Bluetooth на связанное устройство (мастер «Передача файлов по Bluetooth»).
ipcMain.handle("bluetooth:send-file", (_e, { file }) => {
  if (process.platform !== "win32") return { ok: false, error: "Только Windows" };
  if (typeof file !== "string" || !insideAppsDir(file) || !fs.existsSync(file)) return { ok: false, error: "Файл не найден в папке приложений" };
  shell.showItemInFolder(file);
  execFile(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "fsquirt.exe"), [], { windowsHide: false }, () => {});
  return { ok: true };
});

ipcMain.handle("bluetooth:open-settings", () => shell.openExternal("ms-settings:bluetooth"));

// ───────────── USB-флешка для обновления магнитолы ─────────────
// Только копирование выбранного файла на съёмный диск с проверкой SHA-256. Диск не форматируется, ничего не удаляется.
let usbFile = null;

function listRemovableDrives() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    const script = "Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } | Select-Object DriveLetter,FileSystemLabel,FileSystem,Size,SizeRemaining | ConvertTo-Json -Compress";
    const enc = Buffer.from(script, "utf16le").toString("base64");
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { timeout: 20000, windowsHide: true, encoding: "utf8" }, (err, stdout) => {
      if (err || !stdout.trim()) return resolve([]);
      try {
        const raw = JSON.parse(stdout);
        const arr = Array.isArray(raw) ? raw : [raw];
        resolve(
          arr.map((d) => ({
            letter: String(d.DriveLetter),
            label: d.FileSystemLabel || "",
            fileSystem: d.FileSystem || "",
            size: Number(d.Size) || 0,
            free: Number(d.SizeRemaining) || 0,
          })),
        );
      } catch {
        resolve([]);
      }
    });
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file).on("data", (c) => hash.update(c)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
  });
}

ipcMain.handle("usb:drives", () => listRemovableDrives());

ipcMain.handle("usb:pick-file", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Выберите файл обновления для магнитолы", properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null;
  usbFile = r.filePaths[0];
  const st = fs.statSync(usbFile);
  return { name: path.basename(usbFile), size: st.size };
});

// Для самопроверки: подставить файл без окна выбора.
ipcMain.handle("usb:set-file-for-test", (_e, file) => {
  if (!SELFTEST) return false;
  usbFile = String(file);
  return true;
});

ipcMain.handle("usb:copy", async (_e, { letter }) => {
  if (typeof letter !== "string" || !/^[A-Za-z]$/.test(letter)) return { ok: false, error: "Некорректный диск" };
  if (!usbFile || !fs.existsSync(usbFile)) return { ok: false, error: "Сначала выберите файл обновления" };
  const drives = await listRemovableDrives();
  const drive = drives.find((d) => d.letter.toUpperCase() === letter.toUpperCase());
  if (!drive) return { ok: false, error: "Это не съёмный диск: копирование отменено" };
  const size = fs.statSync(usbFile).size;
  if (drive.free && size > drive.free) return { ok: false, error: "На флешке не хватает места" };
  if (/fat32/i.test(drive.fileSystem) && size >= 4 * 1024 * 1024 * 1024) return { ok: false, error: "Файл больше 4 ГБ, а флешка в FAT32: отформатируйте её в exFAT" };
  const dest = path.join(`${drive.letter.toUpperCase()}:\\`, path.basename(usbFile));
  try {
    const before = await sha256File(usbFile);
    await fs.promises.copyFile(usbFile, dest);
    const after = await sha256File(dest);
    if (before !== after) {
      fs.rmSync(dest, { force: true });
      return { ok: false, error: "После копирования файл не совпал с оригиналом: флешка неисправна, файл удалён с неё" };
    }
    return { ok: true, dest, sha256: after };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// ───────────── ADB: установка приложений на магнитолу по Wi-Fi ─────────────
// Запускаем только adb.exe из поставки и только заранее разрешённые команды. Файл .apk выбирается окном системы.
function adbPath() {
  return app.isPackaged ? path.join(process.resourcesPath, "adb", "adb.exe") : path.join(__dirname, "adb", "adb.exe");
}
let pickedApk = null;
const SERIAL_RE = /^(\d{1,3}(\.\d{1,3}){3}:\d{1,5}|emulator-\d+|[A-Za-z0-9]{6,32})$/;
const PKG_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

// Успех определяем по смыслу команды: в списке приложений могут встречаться слова «error» или «failed» в названиях.
function adbSucceeded(args, out, err) {
  if (err) return false;
  const first = args[0] === "-s" ? args[2] : args[0];
  if (first === "connect") return /connected to/i.test(out) && !/cannot|failed|unable|refused/i.test(out);
  if (first === "install") return /^\s*Success/im.test(out);
  if (first === "devices" || first === "version") return true;
  if (first === "shell" && args.includes("pm")) return !/^(error|exception|adb:)/im.test(out);
  return !/^(error|adb: |failure|failed)/im.test(out);
}

function runAdb(args, timeout = 30000) {
  return new Promise((resolve) => {
    const exe = adbPath();
    if (!fs.existsSync(exe)) return resolve({ ok: false, out: "Не найден adb.exe: переустановите приложение." });
    execFile(exe, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" }, (err, stdout, stderr) => {
      const out = `${stdout || ""}${stderr || ""}`;
      resolve({ ok: adbSucceeded(args, out, err), out });
    });
  });
}

ipcMain.handle("adb:run", async (_e, { op, serial, address, pkg }) => {
  switch (op) {
    case "version":
      return runAdb(["version"], 8000);
    case "devices":
      return runAdb(["devices"], 10000);
    case "connect":
      if (typeof address !== "string" || !SERIAL_RE.test(address)) return { ok: false, out: "Некорректный адрес" };
      return runAdb(["connect", address], 15000);
    case "disconnect":
      if (typeof address !== "string" || !SERIAL_RE.test(address)) return { ok: false, out: "Некорректный адрес" };
      return runAdb(["disconnect", address], 8000);
    case "packages":
      if (!SERIAL_RE.test(String(serial))) return { ok: false, out: "Некорректное устройство" };
      return runAdb(["-s", serial, "shell", "pm", "list", "packages", "-3"], 20000);
    case "install":
      if (!SERIAL_RE.test(String(serial))) return { ok: false, out: "Некорректное устройство" };
      if (!pickedApk || !fs.existsSync(pickedApk)) return { ok: false, out: "Сначала выберите файл .apk" };
      return runAdb(["-s", serial, "install", "-r", pickedApk], 300000);
    case "uninstall":
      if (!SERIAL_RE.test(String(serial)) || !PKG_RE.test(String(pkg))) return { ok: false, out: "Некорректные данные" };
      return runAdb(["-s", serial, "uninstall", pkg], 60000);
    case "props":
      if (!SERIAL_RE.test(String(serial))) return { ok: false, out: "Некорректное устройство" };
      return runAdb(["-s", serial, "shell", "getprop"], 20000);
    case "locale":
      if (!SERIAL_RE.test(String(serial))) return { ok: false, out: "Некорректное устройство" };
      return runAdb(["-s", serial, "shell", "am", "start", "-a", "android.settings.LOCALE_SETTINGS"], 15000);
    case "settings":
      if (!SERIAL_RE.test(String(serial))) return { ok: false, out: "Некорректное устройство" };
      return runAdb(["-s", serial, "shell", "am", "start", "-a", "android.settings.SETTINGS"], 15000);
    case "reboot":
      if (!SERIAL_RE.test(String(serial))) return { ok: false, out: "Некорректное устройство" };
      return runAdb(["-s", serial, "reboot"], 15000);
    default:
      return { ok: false, out: "Неизвестная операция" };
  }
});

ipcMain.handle("adb:pick-apk", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Выберите приложение (.apk)", properties: ["openFile"], filters: [{ name: "Приложение Android", extensions: ["apk"] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  pickedApk = r.filePaths[0];
  return path.basename(pickedApk);
});

// Для самопроверки: подставить файл без окна выбора.
ipcMain.handle("adb:set-apk-for-test", (_e, file) => {
  if (!SELFTEST) return false;
  pickedApk = String(file);
  return true;
});

app.on("quit", () => {
  try {
    const exe = adbPath();
    if (fs.existsSync(exe)) execFile(exe, ["kill-server"], { windowsHide: true }, () => {});
  } catch {}
});

// ───────────── Копии оригинальной прошивки блоков (никогда не перезаписываются и не удаляются приложением) ─────────────
// Перед каждой записью приложение читает оригинал блока и кладёт его сюда отдельным файлом с описанием и SHA-256.
// Каждая копия получает своё уникальное имя: следующая прошивка не затирает прежнюю, вернуть можно любую из них.
function fwBackupDir(vin) {
  const safeVin = String(vin || "no-vin").replace(/[^\w\-]+/g, "_").slice(0, 40) || "no-vin";
  const base = SELFTEST ? path.join(SELFTEST, "documents") : app.getPath("documents");
  const dir = path.join(base, "AutoFlash", "FirmwareBackups", safeVin);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle("fwbackup:save", (_e, { vin, ecuName, txId, software, pkgId, pkgVersion, dataBase64 }) => {
  if (typeof dataBase64 !== "string" || dataBase64.length > 80 * 1024 * 1024) throw new Error("Некорректная копия");
  const data = Buffer.from(dataBase64, "base64");
  if (data.length === 0) throw new Error("Пустая копия");
  const dir = fwBackupDir(vin);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = (t) => String(t || "x").replace(/[^\w.\-]+/g, "_").slice(0, 40);
  let base = `${safe(txId)}-${safe(software)}-${stamp}`;
  for (let n = 1; fs.existsSync(path.join(dir, `${base}.bin`)); n++) base = `${safe(txId)}-${safe(software)}-${stamp}-${n}`;
  const file = path.join(dir, `${base}.bin`);
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  fs.writeFileSync(file, data, { flag: "wx" });
  const meta = { id: base, vin: String(vin || ""), ecuName: String(ecuName || ""), txId: String(txId || ""), software: String(software || ""), pkgId: String(pkgId || ""), pkgVersion: String(pkgVersion || ""), at: Date.now(), size: data.length, sha256, file };
  fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify(meta, null, 2), { encoding: "utf8", flag: "wx" });
  return meta;
});

ipcMain.handle("fwbackup:list", (_e, { vin }) => {
  const root = path.dirname(fwBackupDir("x"));
  const dirs = vin ? [fwBackupDir(vin)] : fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(root, d.name));
  const out = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (m && fs.existsSync(m.file)) out.push(m);
      } catch {
        // повреждённое описание пропускаем
      }
    }
  }
  return out.sort((a, b) => b.at - a.at);
});

// Прочитать копию для возврата: заново проверяем контрольную сумму, чтобы не записать в блок повреждённый файл.
ipcMain.handle("fwbackup:read", (_e, { id, vin }) => {
  const dir = fwBackupDir(vin);
  const metaFile = path.join(dir, `${String(id).replace(/[^\w.\-]+/g, "_")}.json`);
  if (!fs.existsSync(metaFile)) return { ok: false, error: "Копия не найдена" };
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  const data = fs.readFileSync(meta.file);
  const sha = crypto.createHash("sha256").update(data).digest("hex");
  if (sha !== meta.sha256) return { ok: false, error: "Контрольная сумма копии не совпала: файл повреждён, записывать его нельзя" };
  return { ok: true, meta, dataBase64: data.toString("base64") };
});

ipcMain.handle("fwbackup:open-folder", (_e, { vin }) => shell.openPath(fwBackupDir(vin)));

// ───────────── Поиск файлов в интернете и карантин ─────────────
// Всё скачанное попадает в карантин («Документы\AutoFlash\Quarantine»): тип файла проверяется по содержимому, считается SHA-256,
// файл сканирует антивирус Windows (Defender), исполняемые файлы блокируются. Ничего не запускается и не устанавливается само.
const ALLOWED_EXT = ["apk", "zip", "bin", "hex", "s19", "srec", "mot", "pdf", "afpkg", "json", "7z", "rar", "img", "cab", "txt"];
const BLOCKED_EXT = ["exe", "msi", "bat", "cmd", "ps1", "vbs", "js", "jse", "scr", "dll", "com", "lnk", "jar", "sh", "reg", "hta"];
const MAX_DOWNLOAD = 600 * 1024 * 1024;

function quarantineDir() {
  return userDocsDir("Quarantine");
}

function sniffType(file) {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(8);
  const n = fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  if (n >= 2 && head[0] === 0x4d && head[1] === 0x5a) return "exe"; // MZ: исполняемый файл Windows
  if (n >= 4 && head[0] === 0x7f && head.slice(1, 4).toString() === "ELF") return "elf";
  if (n >= 4 && head.slice(0, 4).toString() === "%PDF") return "pdf";
  if (n >= 4 && head[0] === 0x50 && head[1] === 0x4b) {
    // zip или apk: у APK внутри есть AndroidManifest.xml (имя лежит в оглавлении архива в конце файла)
    const size = fs.statSync(file).size;
    const tail = Buffer.alloc(Math.min(size, 2 * 1024 * 1024));
    const fd2 = fs.openSync(file, "r");
    fs.readSync(fd2, tail, 0, tail.length, size - tail.length);
    fs.closeSync(fd2);
    return tail.includes("AndroidManifest.xml") ? "apk" : "zip";
  }
  const fd3 = fs.openSync(file, "r");
  const probe = Buffer.alloc(2000);
  const got = fs.readSync(fd3, probe, 0, 2000, 0);
  fs.closeSync(fd3);
  if (probe.slice(0, got).toString("utf8").trimStart().startsWith("{")) return "json";
  return "bin";
}

function findDefender() {
  const candidates = [path.join(process.env.ProgramFiles || "C:\\Program Files", "Windows Defender", "MpCmdRun.exe")];
  const platform = path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows Defender", "Platform");
  try {
    for (const v of fs.readdirSync(platform).sort().reverse()) candidates.unshift(path.join(platform, v, "MpCmdRun.exe"));
  } catch {
    // папки платформы нет
  }
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function defenderScan(file) {
  return new Promise((resolve) => {
    const exe = process.platform === "win32" ? findDefender() : null;
    if (!exe) return resolve("unavailable");
    execFile(exe, ["-Scan", "-ScanType", "3", "-File", file, "-DisableRemediation"], { timeout: 180000, windowsHide: true }, (err) => {
      if (!err) return resolve("clean");
      resolve(err.code === 2 ? "threat" : "error");
    });
  });
}

/** Для APK: под какие процессоры собрано приложение (по именам папок lib/<процессор>/ в архиве). Пусто: приложение без своих библиотек. */
function apkAbis(file) {
  const size = fs.statSync(file).size;
  const tail = Buffer.alloc(Math.min(size, 4 * 1024 * 1024));
  const fd = fs.openSync(file, "r");
  fs.readSync(fd, tail, 0, tail.length, size - tail.length);
  fs.closeSync(fd);
  const text = tail.toString("latin1");
  return ["arm64-v8a", "armeabi-v7a", "x86_64", "x86"].filter((a) => text.includes(`lib/${a}/`));
}

async function analyzeFile(file) {
  const size = fs.statSync(file).size;
  const sha256 = await sha256File(file);
  const type = sniffType(file);
  const warnings = [];
  if (type === "exe" || type === "elf") warnings.push("Это исполняемый файл программы, а не прошивка и не приложение для магнитолы. Принимать нельзя.");
  const defender = type === "exe" || type === "elf" ? "skipped" : await defenderScan(file);
  if (defender === "threat") warnings.push("Антивирус Windows нашёл угрозу в этом файле.");
  if (defender === "unavailable") warnings.push("Антивирус Windows недоступен: проверить файл на вирусы не удалось.");
  if (defender === "error") warnings.push("Антивирус не смог проверить файл.");
  if (type === "bin") warnings.push("Тип файла не определён: это может быть образ прошивки. AutoFlash не записывает чужие образы напрямую (нужен пакет формата AutoFlash).");
  return { size, sha256, type, defender, warnings, abis: type === "apk" ? apkAbis(file) : [], blocked: type === "exe" || type === "elf" || defender === "threat" };
}

function qMeta(id) {
  const f = path.join(quarantineDir(), `${id}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}

function saveQuarantined(tmpFile, name, sourceUrl) {
  return analyzeFile(tmpFile).then((a) => {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const stored = path.join(quarantineDir(), `${id}-${name}`);
    fs.renameSync(tmpFile, stored);
    const meta = { id, name, sourceUrl, stored, at: Date.now(), ...a };
    fs.writeFileSync(path.join(quarantineDir(), `${id}.json`), JSON.stringify(meta, null, 2), "utf8");
    return meta;
  });
}

function fileNameFrom(res, url) {
  let name = "";
  const cd = res.headers.get("content-disposition") || "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  if (m) name = decodeURIComponent(m[1]);
  if (!name) name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "file");
  return name.replace(/[^\w.\-а-яА-ЯёЁ ]+/g, "_").slice(0, 80) || "file";
}

ipcMain.handle("web:search", async (_e, { query }) => {
  if (typeof query !== "string" || query.trim().length < 3 || query.length > 200) return { ok: false, results: [], error: "Слишком короткий или длинный запрос" };
  try {
    const r = await net.fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AutoFlash", Accept: "text/html" } });
    if (!r.ok) return { ok: false, results: [], error: `Поисковик ответил ошибкой ${r.status}` };
    const html = await r.text();
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m;
    const strip = (t) => String(t || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    while ((m = re.exec(html)) && results.length < 12) {
      let url = m[1].replace(/&amp;/g, "&");
      if (url.startsWith("//")) url = `https:${url}`;
      try {
        const u = new URL(url);
        if (u.hostname.endsWith("duckduckgo.com") && u.searchParams.get("uddg")) url = u.searchParams.get("uddg");
      } catch {
        continue;
      }
      if (!/^https:\/\//.test(url)) continue;
      results.push({ title: strip(m[2]).slice(0, 160), url, snippet: strip(m[3]).slice(0, 240) });
    }
    return results.length ? { ok: true, results } : { ok: false, results: [], error: "Поисковик не вернул результатов (или изменил страницу): откройте поиск в браузере" };
  } catch {
    return { ok: false, results: [], error: "Нет интернета или поисковик недоступен" };
  }
});

ipcMain.handle("web:open", (_e, { url }) => {
  if (typeof url !== "string" || !/^https:\/\/[^\s]+$/.test(url)) return false;
  void shell.openExternal(url);
  return true;
});

ipcMain.handle("quarantine:download", async (_e, { url }) => {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return { ok: false, error: "Некорректный адрес" };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Скачивать можно только по https" };
  const urlExt = (decodeURIComponent(u.pathname).split(".").pop() || "").toLowerCase();
  if (BLOCKED_EXT.includes(urlExt)) return { ok: false, error: `Файлы .${urlExt} запускают программы на компьютере: скачивание запрещено` };
  const tmp = path.join(quarantineDir(), `download-${Date.now().toString(36)}.part`);
  try {
    const res = await net.fetch(u.toString(), { redirect: "follow" });
    if (!res.ok || !res.body) return { ok: false, error: `Сервер ответил ошибкой ${res.status}` };
    if (!String(res.url).startsWith("https://")) return { ok: false, error: "Сервер перенаправил на небезопасный адрес" };
    const ctype = String(res.headers.get("content-type") || "").toLowerCase();
    if (ctype.includes("text/html")) return { ok: false, error: "Это веб-страница, а не файл. Откройте её в браузере и найдите прямую ссылку на файл." };
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_DOWNLOAD) return { ok: false, error: "Файл больше 600 МБ: скачивание отменено" };
    const name = fileNameFrom(res, String(res.url));
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (BLOCKED_EXT.includes(ext)) return { ok: false, error: `Файлы .${ext} запускают программы на компьютере: скачивание запрещено` };
    if (name.includes(".") && !ALLOWED_EXT.includes(ext)) return { ok: false, error: `Тип .${ext} не из списка разрешённых` };
    let bytes = 0;
    const src = Readable.fromWeb(res.body);
    src.on("data", (c) => {
      bytes += c.length;
      if (bytes > MAX_DOWNLOAD) src.destroy(new Error("Файл больше 600 МБ"));
    });
    await pipeline(src, fs.createWriteStream(tmp));
    const meta = await saveQuarantined(tmp, name, String(res.url));
    return { ok: true, item: meta };
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Для самопроверки: поместить локальный файл в карантин (проверяется тем же кодом, что и скачанное).
ipcMain.handle("quarantine:add-local-for-test", async (_e, { file }) => {
  if (!SELFTEST) return { ok: false, error: "Только для самопроверки" };
  const tmp = path.join(quarantineDir(), `local-${Date.now().toString(36)}.part`);
  fs.copyFileSync(String(file), tmp);
  return { ok: true, item: await saveQuarantined(tmp, path.basename(String(file)), "local") };
});

ipcMain.handle("quarantine:list", () => {
  const dir = quarantineDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.includes("-"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter((m) => m && fs.existsSync(m.stored))
    .sort((a, b) => b.at - a.at);
});

// Текст небольшого пакета (.afpkg / json) из карантина, чтобы показать его описание и проверить, подходит ли он машине.
ipcMain.handle("quarantine:read-text", (_e, { id }) => {
  const meta = typeof id === "string" && /^[\w]+$/.test(id) ? qMeta(id) : null;
  if (!meta || meta.type !== "json" || meta.size > 5 * 1024 * 1024) return null;
  return fs.readFileSync(meta.stored, "utf8");
});

ipcMain.handle("quarantine:delete", (_e, { id }) => {
  const meta = typeof id === "string" && /^[\w]+$/.test(id) ? qMeta(id) : null;
  if (!meta) return false;
  fs.rmSync(meta.stored, { force: true });
  fs.rmSync(path.join(quarantineDir(), `${id}.json`), { force: true });
  return true;
});

// Принять файл: APK уходит в библиотеку приложений; пакеты (.afpkg/.json) возвращаем текстом для проверки и добавления в библиотеку.
ipcMain.handle("quarantine:accept", (_e, { id }) => {
  const meta = typeof id === "string" && /^[\w]+$/.test(id) ? qMeta(id) : null;
  if (!meta) return { ok: false, error: "Файл не найден в карантине" };
  if (meta.blocked) return { ok: false, error: "Этот файл заблокирован проверкой: принимать его нельзя" };
  if (meta.type === "apk") {
    const dest = path.join(appsDir(), meta.name.replace(/\.part$/, ""));
    fs.copyFileSync(meta.stored, dest);
    fs.rmSync(meta.stored, { force: true });
    fs.rmSync(path.join(quarantineDir(), `${id}.json`), { force: true });
    return { ok: true, kind: "apk", dest };
  }
  if ((meta.type === "json" || /\.afpkg$/i.test(meta.name)) && meta.size < 20 * 1024 * 1024) {
    return { ok: true, kind: "package", text: fs.readFileSync(meta.stored, "utf8"), id };
  }
  return { ok: false, error: "Приложение не знает, как использовать этот тип файла: для прошивок нужен пакет формата AutoFlash (конструктор пакета), для обновления магнитолы файл копируется на флешку в разделе «Приложения и русификация»." };
});

// ───────────── Проверка обновлений приложения (по запросу пользователя) ─────────────
// Обращается к открытой странице релизов на GitHub. Ничего не скачивает и не устанавливает само: только сообщает о новой версии.
const UPDATE_REPO = "MadiyarKuanyshbek/AI-auto-business";

function compareVersions(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

ipcMain.handle("update:check", async () => {
  const current = app.getVersion();
  try {
    const r = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "AutoFlash-update-check" } });
    if (r.status === 404) return { ok: true, current, latest: null };
    if (!r.ok) return { ok: false, current, error: `GitHub ответил ошибкой ${r.status}` };
    const j = await r.json();
    const latest = String(j.tag_name || "").replace(/^v/i, "");
    const asset = (j.assets || []).find((a) => /AutoFlash-Setup-.*\.exe$/i.test(a.name));
    return { ok: true, current, latest, newer: !!latest && compareVersions(latest, current) > 0, url: String(j.html_url || ""), downloadUrl: asset ? String(asset.browser_download_url) : null, notes: String(j.body || "").slice(0, 800) };
  } catch {
    return { ok: false, current, error: "Нет интернета или GitHub недоступен" };
  }
});

ipcMain.handle("update:open", (_e, { url }) => {
  if (typeof url !== "string" || !url.startsWith(`https://github.com/${UPDATE_REPO}/`)) return false;
  void shell.openExternal(url);
  return true;
});

// ───────────── J2534: поиск установленных профессиональных сканеров (только список) ─────────────
// Драйверы J2534 (Autel, Tactrix, Drew Technologies и др.) регистрируются в реестре Windows. Работать с ними приложение пока не умеет:
// драйверы чаще 32-разрядные и требуют отдельного посредника. Здесь только определяем, что они стоят в системе.
ipcMain.handle("j2534:list", () =>
  new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    const script = "$out=@(); foreach ($base in 'HKLM:\\SOFTWARE\\PassThruSupport.04.04','HKLM:\\SOFTWARE\\WOW6432Node\\PassThruSupport.04.04') { if (Test-Path $base) { foreach ($k in Get-ChildItem $base) { $p=Get-ItemProperty $k.PSPath; if ($p.Name) { $out += [pscustomobject]@{ name=[string]$p.Name; vendor=[string]$p.Vendor } } } } }; ConvertTo-Json -Compress -InputObject @($out)";
    const enc = Buffer.from(script, "utf16le").toString("base64");
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { timeout: 15000, windowsHide: true, encoding: "utf8" }, (err, stdout) => {
      if (err || !stdout.trim()) return resolve([]);
      try {
        const raw = JSON.parse(stdout);
        const arr = Array.isArray(raw) ? raw : [raw];
        const seen = new Set();
        resolve(arr.filter((d) => d && d.name && !seen.has(d.name) && seen.add(d.name)).map((d) => ({ name: String(d.name), vendor: String(d.vendor || "") })));
      } catch {
        resolve([]);
      }
    });
  }),
);

// ───────────── PDF-отчёты и журнал для поддержки ─────────────
function userDocsDir(sub) {
  const base = SELFTEST ? path.join(SELFTEST, "documents") : app.getPath("documents");
  const dir = path.join(base, "AutoFlash", sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeFileName(name, ext) {
  const base = String(name || "report").replace(/[^\w.\-а-яА-ЯёЁ ]+/g, "_").slice(0, 60).trim() || "report";
  return `${base}.${ext}`;
}

// Отчёт рисуется в скрытом окне без доступа к системе и сохраняется как PDF.
ipcMain.handle("pdf:save", async (_e, { html, name }) => {
  if (typeof html !== "string" || html.length > 20 * 1024 * 1024) throw new Error("Некорректный отчёт");
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  try {
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const data = await pdfWin.webContents.printToPDF({ pageSize: "A4", printBackground: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(userDocsDir("Reports"), safeFileName(`${name || "report"}-${day}-${Date.now().toString(36)}`, "pdf"));
    fs.writeFileSync(file, data);
    return file;
  } finally {
    pdfWin.destroy();
  }
});

ipcMain.handle("file:reveal", (_e, { file }) => {
  const docs = userDocsDir("");
  const rel = path.relative(docs, path.resolve(String(file)));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  shell.showItemInFolder(path.resolve(String(file)));
  return true;
});

ipcMain.handle("file:save-text", (_e, { text, name, ext }) => {
  if (typeof text !== "string" || text.length > 20 * 1024 * 1024) throw new Error("Некорректные данные");
  if (!["csv", "txt", "json"].includes(ext)) throw new Error("Некорректный тип файла");
  const day = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = path.join(userDocsDir("Reports"), safeFileName(`${name || "data"}-${day}`, ext));
  fs.writeFileSync(file, ext === "csv" ? `\uFEFF${text}` : text, "utf8"); // BOM: Excel правильно читает русские буквы
  return file;
});

ipcMain.handle("log:export", (_e, { text }) => {
  if (typeof text !== "string" || text.length > 20 * 1024 * 1024) throw new Error("Некорректный журнал");
  const day = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = path.join(userDocsDir("Logs"), `support-${day}.txt`);
  const header = `AutoFlash ${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform} ${os.release()}\n\n`;
  fs.writeFileSync(file, header + text, "utf8");
  return file;
});

// ───────────── Окно ─────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 600,
    title: "AutoFlash",
    backgroundColor: "#0B1220",
    icon: path.join(__dirname, "icon.ico"),
    autoHideMenuBar: true,
    show: !SELFTEST,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Окно может быть свёрнуто или скрыто во время долгой записи: таймеры и обмен с адаптером не должны замедляться.
      backgroundThrottling: false,
    },
  });

  // Внешние ссылки (WhatsApp и т.п.) открываем в обычном браузере, а не внутри приложения.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Пустое окно нужно для печати отчётов и квитанций (window.open("") → write → print).
    if (url === "about:blank" || url === "") {
      return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 900, height: 800, webPreferences: { sandbox: true } } };
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://")) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  // Bluetooth LE: список находок отправляем в интерфейс.
  win.webContents.on("select-bluetooth-device", (event, deviceList, callback) => {
    event.preventDefault();
    offerDevices(
      "bluetooth",
      deviceList.map((d) => ({ id: d.deviceId, name: d.deviceName || "Без имени" })),
      callback,
    );
  });

  // Идёт запись прошивки: спрашиваем, прежде чем закрыть окно (обрыв может повредить блок).
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Остаться", "Закрыть всё равно"],
      defaultId: 0,
      cancelId: 0,
      title: "Идёт запись",
      message: "Идёт запись прошивки в блок автомобиля.",
      detail: "Если закрыть приложение сейчас, блок может остаться с неполной прошивкой. Подождите завершения.",
    });
    if (choice === 1) event.preventDefault();
  });

  void win.loadURL("app://autoflash/");
  return win;
}

app.whenReady().then(() => {
  registerAppProtocol();

  // Разрешаем только то, что нужно приложению: Bluetooth и последовательные порты.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(["bluetooth", "serial", "clipboard-sanitized-write"].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ["bluetooth", "serial"].includes(permission));
  session.defaultSession.setDevicePermissionHandler((details) => details.deviceType === "serial" || details.deviceType === "bluetooth");
  session.defaultSession.on("select-serial-port", (event, portList, _wc, callback) => {
    event.preventDefault();
    offerDevices(
      "serial",
      portList.map((p) => ({
        id: p.portId,
        name: [p.displayName, p.portName].filter(Boolean).join(" · ") || "Последовательный порт",
      })),
      callback,
    );
  });

  createWindow();
  if (SELFTEST) require("./selftest.cjs").run(win, SELFTEST, app);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
