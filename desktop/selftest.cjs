// Самопроверка собранного приложения: запускается как `AutoFlash.exe --selftest=<папка>`.
// Проходит живой сценарий: Wi-Fi (TCP) → подключение → сканирование → экран «Авто» — и
// сохраняет скриншоты и отчёт. Нужна, чтобы проверять именно упакованный .exe, а не исходники.
const fs = require("node:fs");
const path = require("node:path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(win, outDir, app) {
  fs.mkdirSync(outDir, { recursive: true });
  const wc = win.webContents;
  const report = { steps: [], errors: [] };
  const step = (name, ok, detail) => report.steps.push({ name, ok, detail });
  wc.on("console-message", (_e, level, message) => {
    if (level >= 2) report.errors.push(message.slice(0, 300));
  });

  const shot = async (name) => {
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
  };
  const js = (code) => wc.executeJavaScript(code);

  // Клик настоящим событием мыши по элементу с точным текстом.
  const clickText = async (text) => {
    const rect = await js(`(() => {
      const t = ${JSON.stringify(text)};
      const els = [...document.querySelectorAll('div,span,a,button')].filter(e => e.textContent.trim() === t && e.offsetParent !== null);
      if (!els.length) return null;
      els.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);
      const r = els[0].getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (!rect) return false;
    wc.sendInputEvent({ type: "mouseMove", x: rect.x, y: rect.y });
    wc.sendInputEvent({ type: "mouseDown", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    return true;
  };

  try {
    await new Promise((r) => (wc.isLoading() ? wc.once("did-finish-load", r) : r()));
    await sleep(2500);
    report.desktopBridge = await js("!!window.autoflash && window.autoflash.desktop === true");
    step("загрузка интерфейса", (await js("document.body.innerText")).includes("AutoFlash"));
    await shot("01-connect");

    step("вкладка Wi-Fi", await clickText("Wi‑Fi"));
    await sleep(400);
    await js(`(() => {
      const input = [...document.querySelectorAll('input')].find(i => i.value === '192.168.0.10');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(input, '127.0.0.1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(200);
    step("подключение по TCP", await clickText("Подключиться"));
    await sleep(2500);
    const connected = (await js("document.body.innerText")).includes("Подключён");
    step("адаптер подключён", connected);
    await shot("02-connected");

    if (connected) {
      step("запуск сканирования", await clickText("Сканировать автомобиль"));
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        if ((await js("location.pathname")).includes("vehicle")) break;
      }
      await sleep(2000);
      const text = await js("document.body.innerText");
      report.vehicleText = text.slice(0, 1500);
      step("экран «Авто»", /WVWZZZ1KZBW123456/.test(text) && /Двигатель/.test(text));
      await shot("03-vehicle");
    }
  } catch (e) {
    step("исключение", false, String(e && e.message ? e.message : e));
  }

  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  app.exit(report.steps.every((s) => s.ok) ? 0 : 1);
}

module.exports = { run };
