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
    // Защита от выхода за пределы папки интерфейса.
    if (!file.startsWith(WEB_ROOT)) return new Response("Forbidden", { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // Маршруты приложения (/vehicle, /tune…) → единая страница (SPA).
      file = path.join(WEB_ROOT, "index.html");
    }
    return net.fetch(pathToFileURL(file).toString());
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

ipcMain.handle("backup:save", (_e, { json, name }) => {
  if (typeof json !== "string" || json.length > 50 * 1024 * 1024) throw new Error("Некорректные данные копии");
  const dir = backupDir();
  const day = new Date().toISOString().slice(0, 10);
  const safeName = typeof name === "string" && /^[\w.\-]+$/.test(name) ? name : `autoflash-${day}.json`;
  const file = path.join(dir, safeName);
  fs.writeFileSync(file, json, "utf8");
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
