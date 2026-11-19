// Главный процесс настольного AutoFlash (Electron).
// Приложение — это тот же интерфейс, что и в браузере, но с настоящими возможностями ПК:
// Bluetooth LE, COM-порты (USB-кабели и спаренные Bluetooth-адаптеры) и TCP для Wi-Fi адаптеров.
const { app, BrowserWindow, ipcMain, protocol, net, shell, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const netSocket = require("node:net");

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

// ───────────── Окно ─────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 780,
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
