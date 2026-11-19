// Полная самопроверка собранного приложения: `AutoFlash.exe --selftest=<папка>`.
// Нужен запущенный виртуальный адаптер (npm run sim-server). Проходит по всем разделам
// настоящим кликом мыши и вводом текста, проверяет результат на экране и сохраняет
// скриншоты и report.json. Код выхода 0 — всё прошло.
const fs = require("node:fs");
const path = require("node:path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(win, outDir, app) {
  fs.mkdirSync(outDir, { recursive: true });
  const wc = win.webContents;
  const report = { steps: [], errors: [] };
  const step = (name, ok, detail) => {
    report.steps.push({ name, ok: !!ok, detail });
    console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  };
  wc.on("console-message", (event) => {
    const e = event.level !== undefined ? event : { level: 0, message: "" };
    if ((e.level === "error" || e.level >= 3) && !/ResizeObserver/.test(String(e.message))) report.errors.push(String(e.message).slice(0, 300));
  });

  const js = (code) => wc.executeJavaScript(code);
  const text = () => js("document.body.innerText");
  const shot = async (name) => {
    await sleep(350);
    fs.writeFileSync(path.join(outDir, `${name}.png`), (await wc.capturePage()).toPNG());
  };
  const waitText = async (needle, timeout = 8000) => {
    const re = needle instanceof RegExp ? needle : null;
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const t = await text();
      if (re ? re.test(t) : t.includes(needle)) return true;
      await sleep(200);
    }
    return false;
  };

  const click = async (label, { nth = 0, exact = true } = {}) => {
    const rect = await js(`(() => {
      const t = ${JSON.stringify(label)};
      const els = [...document.querySelectorAll('div,span,a,button')].filter(e => {
        const x = e.textContent.trim();
        return (${exact} ? x === t : x.includes(t)) && e.offsetParent !== null;
      });
      if (!els.length) return null;
      els.sort((a, b) => a.getBoundingClientRect().height * a.getBoundingClientRect().width - b.getBoundingClientRect().height * b.getBoundingClientRect().width);
      const el = els[${nth}] || els[0];
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (!rect) return false;
    await sleep(120);
    const r2 = await js(`(() => {
      const t = ${JSON.stringify(label)};
      const els = [...document.querySelectorAll('div,span,a,button')].filter(e => { const x = e.textContent.trim(); return (${exact} ? x === t : x.includes(t)) && e.offsetParent !== null; });
      els.sort((a, b) => a.getBoundingClientRect().height * a.getBoundingClientRect().width - b.getBoundingClientRect().height * b.getBoundingClientRect().width);
      const r = (els[${nth}] || els[0]).getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    wc.sendInputEvent({ type: "mouseMove", x: r2.x, y: r2.y });
    wc.sendInputEvent({ type: "mouseDown", x: r2.x, y: r2.y, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", x: r2.x, y: r2.y, button: "left", clickCount: 1 });
    await sleep(350);
    return true;
  };

  // Переход по пункту бокового меню с ожиданием смены адреса.
  const goTo = async (label, pathPart) => {
    const ok = await click(label);
    for (let i = 0; i < 40; i++) {
      const p = await js("location.pathname");
      if (pathPart === "/" ? p === "/" : p.includes(pathPart)) break;
      await sleep(150);
    }
    await sleep(500);
    return ok;
  };

  // Ввод в поле, расположенное сразу под подписью (компонент Field).
  const fill = async (label, value) =>
    js(`(() => {
      const lab = [...document.querySelectorAll('div')].find(e => e.textContent.trim() === ${JSON.stringify(label)} && e.children.length === 0);
      const input = lab && lab.parentElement.querySelector('input,textarea');
      if (!input) return false;
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);

  try {
    await new Promise((r) => (wc.isLoading() ? wc.once("did-finish-load", r) : r()));
    await sleep(2500);
    await js("window.__rx = 0; window.autoflash.tcp.onData(() => { window.__rx++; }); null");
    step("мост рабочего стола подключён", await js("!!window.autoflash && window.autoflash.desktop === true"));
    step("интерфейс загружен", (await text()).includes("AutoFlash"));
    await shot("01-connect");

    // ── Меню слева, по порядку ──
    const nav = await js(`(() => {
      const names = ['1. Подключение','2. Авто','3. Живые данные','4. Прошивки','5. Клиенты и заказы','6. Настройки'];
      return names.map(n => {
        const el = [...document.querySelectorAll('div,span')].filter(e => e.textContent.trim() === n && e.children.length === 0)[0];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y) };
      });
    })()`);
    const found = nav.every(Boolean);
    const leftAligned = found && nav.every((p) => p.x < 260) && nav.every((p, i) => i === 0 || p.y > nav[i - 1].y);
    step("меню слева вертикально по порядку (6 пунктов)", leftAligned, JSON.stringify(nav));

    // ── Подключение по Wi-Fi (TCP) ──
    step("вкладка Wi-Fi", await click("Wi‑Fi"));
    step("поле адреса", await fill("Адрес", "127.0.0.1"));
    await click("Подключиться");
    step("адаптер подключён", await waitText("Подключён", 6000));
    await shot("02-connected");

    // ── Сканирование и экран «Авто» ──
    await click("Сканировать автомобиль");
    let onVehicle = false;
    for (let i = 0; i < 100 && !onVehicle; i++) {
      onVehicle = (await js("location.pathname")).includes("vehicle") && (await text()).includes("Блоки управления");
      if (!onVehicle) await sleep(250);
    }
    await sleep(500);
    step("сканирование завершено", onVehicle);
    const v = await text();
    step("VIN определён", v.includes("WVWZZZ1KZBW123456"));
    step("модельный год 2011 (не 1981)", v.includes("(2011)") && !v.includes("1981"));
    step("найдены 3 блока", v.includes("Блоки управления (3)"));
    step("семейство Bosch EDC17 распознано", v.includes("Bosch EDC17"));
    step("номер ПО поставщика считан", v.includes("1037525811"));
    step("Calibration ID считан", v.includes("03L906018FQ 0258"));
    step("код P0299 показан с описанием", v.includes("P0299") && v.includes("Недостаточный наддув"));
    await shot("03-vehicle");

    // ── Сброс ошибок (двойное подтверждение) ──
    step("кнопка сброса ошибок", await click("Сбросить ошибки"));
    step("запрос подтверждения", await waitText("Сначала запишите их"));
    await shot("04-clear-confirm");
    step("подтверждение сброса", await click("Да, сбросить"));
    step("после сброса ошибок нет", await waitText("Кодов неисправностей нет", 20000));

    // ── Живые данные ──
    await goTo("3. Живые данные", "live");
    step("живые данные: обороты 800", await waitText(/Обороты двигателя\s+800\s+об\/мин/, 15000));
    step("живые данные: температура ОЖ 55", await waitText(/Температура ОЖ\s+55\s+°C/, 15000));
    await sleep(1200);
    await shot("05-live");

    // ── Опрос живых данных не должен идти в фоне ──
    await goTo("2. Авто", "vehicle");
    await sleep(1500);
    const rx1 = await js("window.__rx");
    await sleep(2500);
    const rx2 = await js("window.__rx");
    step("вне вкладки «Живые данные» адаптер не опрашивается", rx2 === rx1, `${rx1} → ${rx2}`);
    await click("3. Живые данные");
    await sleep(2000);
    step("при возврате на вкладку опрос возобновляется", (await js("window.__rx")) > rx2);

    // ── Прошивки ──
    await goTo("4. Прошивки", "tune");
    const tune = await waitText("Stage 1");
    step("подбор: найден Stage 1 для EDC17", tune);
    step("подбор: найдена позиция DSG", (await text()).includes("DSG"));
    step("предупреждение о выбросах показано", (await text()).includes("не включает позиции, отключающие системы очистки"));
    await shot("06-tune");
    await click("Подготовить прошивку", { nth: 0 });
    step("экран прошивки", await waitText("Проверки перед запуском"));
    const flashText = await text();
    step("через ELM327 прошивка заблокирована", flashText.includes("ELM327-адаптеры не подходят"));
    step("демо-позиция заблокирована", flashText.includes("демонстрационная"));
    await click("Симуляция");
    await click("Сохранить копию оригинальной прошивки");
    step("резервная копия делается на симуляции", await waitText("Копия оригинала сохранена"));
    await shot("07-flash");
    step("меню слева остаётся на экране прошивки", (await text()).includes("5. Клиенты и заказы"));
    step("стрелка «Назад» есть в заголовке", await js("!!document.querySelector('[aria-label=\"Прошивки, back\"], [aria-label*=\"back\" i], [aria-label*=\"Назад\"]')"));
    await js("history.back()");
    step("возврат к подбору работает", await waitText("Что можно сделать с этим авто"));

    // ── Клиенты и заказы ──
    await goTo("5. Клиенты и заказы", "clients");
    step("раздел клиентов открыт", await waitText("Получено"));
    await click("Клиенты (0)");
    await click("Добавить клиента");
    step("имя клиента введено", await fill("Имя", "Тест Клиентов"));
    step("телефон введён", await fill("Телефон", "+7 700 123 45 67"));
    await click("Сохранить");
    step("карточка клиента открылась", await waitText("Новый заказ для клиента", 6000));
    step("меню слева остаётся на карточке клиента", (await text()).includes("6. Настройки"));
    await shot("08-customer");
    await click("Новый заказ для клиента");
    step("заказ создан", await waitText("История", 6000));
    step("ввод стоимости", await fill("Стоимость, ₸", "90000"));
    step("ввод оплаты", await fill("Оплачено, ₸", "40000"));
    step("остаток считается (50 000)", await waitText(/50\s?000/));
    await click("Выполнен");
    step("статус «Выполнен» записан в историю", await waitText("Статус: Выполнен"));
    await shot("09-job");
    const stored = await js("localStorage.getItem('autoflash.v1')");
    step("данные сохранены на диск", !!stored && stored.includes("Тест Клиентов") && stored.includes("90000"));

    // ── Настройки: импорт каталога ──
    await goTo("6. Настройки", "settings");
    step("настройки открыты", await waitText("Каталог прошивок"));
    step("JSON каталога введён", await fill("JSON каталога", JSON.stringify([{ id: "x1", title: "Тестовая позиция", category: "economy", status: "beta", compat: { familyIds: ["bosch-edc17"] } }])));
    await click("Загрузить");
    step("каталог загружен", await waitText("Загружено позиций: 1"));
    await shot("10-settings");
    await click("Показать", { exact: false });
    step("журнал обмена показывает команды", await waitText(/→ 01/, 3000));

    // ── Новая позиция каталога видна в подборе ──
    await goTo("4. Прошивки", "tune");
    step("импортированная позиция в подборе", await waitText("Тестовая позиция"));

    // ── Отключение ──
    await goTo("1. Подключение", "/");
    await click("Отключиться");
    step("отключение", await waitText("Не подключён"));
    await shot("11-disconnected");

    // ── Перезапуск страницы: данные клиента остаются ──
    await js("location.reload()");
    await sleep(3000);
    await goTo("5. Клиенты и заказы", "clients");
    await click("Клиенты (1)");
    step("после перезапуска клиент на месте", await waitText("Тест Клиентов", 6000));
    await goTo("2. Авто", "vehicle");
    step("после перезапуска последний скан показан", await waitText("WVWZZZ1KZBW123456", 6000));
    await goTo("4. Прошивки", "tune");
    step("импортированный каталог пережил перезапуск", await waitText("Тестовая позиция", 6000));

  } catch (e) {
    step("исключение", false, String(e && e.message ? e.message : e));
  }

  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  const failed = report.steps.filter((s) => !s.ok).length;
  console.log(`ИТОГО: ${report.steps.length - failed}/${report.steps.length} шагов, ошибок консоли: ${report.errors.length}`);
  app.exit(failed === 0 ? 0 : 1);
}

module.exports = { run };
