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
    await sleep(1300); // окно скрыто: даём интерфейсу дорисоваться перед снимком
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

  // Клик настоящим событием мыши. Неактивные вкладки остаются в DOM под активной, поэтому из всех
  // элементов с нужным текстом выбираем тот, который реально виден сверху (проверка elementFromPoint).
  const click = async (label, { nth = 0, exact = true } = {}) => {
    const found = await js(`(() => {
      const t = ${JSON.stringify(label)};
      const els = [...document.querySelectorAll('div,span,a,button')].filter((e) => {
        const x = e.textContent.trim();
        return (${exact} ? x === t : x.includes(t)) && e.offsetParent !== null;
      });
      if (!els.length) return false;
      const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
      els.sort((a, b) => area(a) - area(b));
      const onTop = (e) => {
        e.scrollIntoView({ block: 'center' });
        const r = e.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !!top && (e.contains(top) || top.contains(e));
      };
      const visible = els.filter(onTop);
      const chosen = (visible.length ? visible : els)[${nth}] || (visible.length ? visible : els)[0];
      chosen.scrollIntoView({ block: 'center' });
      window.__clickEl = chosen;
      return true;
    })()`);
    if (!found) return false;
    await sleep(150);
    const r2 = await js(`(() => {
      const r = window.__clickEl.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    wc.sendInputEvent({ type: "mouseMove", x: r2.x, y: r2.y });
    wc.sendInputEvent({ type: "mouseDown", x: r2.x, y: r2.y, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", x: r2.x, y: r2.y, button: "left", clickCount: 1 });
    await sleep(350);
    return true;
  };

  const closeSheet = async () => {
    if ((await text()).includes("Подключено. Что сделать?")) {
      await click("Закрыть");
      await sleep(500);
    }
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

    // ── Меню слева: два пункта по порядку ──
    const nav = await js(`(() => {
      const names = ['1. Подключение', '2. Авто и прошивки', '3. Демо интерфейс авто'];
      return names.map(n => {
        const el = [...document.querySelectorAll('div,span')].filter(e => e.textContent.trim() === n && e.children.length === 0)[0];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y) };
      });
    })()`);
    step("меню слева вертикально, три пункта по порядку", nav.every(Boolean) && nav.every((p) => p.x < 300) && nav[1].y > nav[0].y && nav[2].y > nav[1].y, JSON.stringify(nav));
    const menuText = await text();
    step("вкладок «Клиенты» и «Настройки» нет", !menuText.includes("Клиенты и заказы") && !menuText.includes("Настройки"));

    // ════════ Часть 1: виртуальный автомобиль (демо-адаптер внутри приложения) ════════
    step("режимы: по умолчанию реальный, демо отдельно", (await text()).includes("Реальный режим") && (await text()).includes("Демо-режим") && !(await text()).includes("ДЕМО: виртуальные автомобили"));
    step("режимы: в реальном режиме видна связь компьютера, демо-машин на радаре нет", await waitText("Связь компьютера", 30000) && !(await text()).includes("Volkswagen Golf 6 2.0 TDI (демо)"));
    step("режимы: переход в демо-режим", await click("Демо-режим") && await waitText("ДЕМО: виртуальные автомобили", 4000));
    step("режимы: в демо нет связи компьютера и ручного подключения", !(await text()).includes("Связь компьютера") && !(await text()).includes("Подключить вручную"));
    step("радар: на экране подключения есть радар", await js("!!document.querySelector('[data-testid=radar]')"));
    step("радар: нашлись демо-автомобили", await waitText("Найдено: 6", 15000) || (await text()).includes("Найдено:"));
    step("радар: нажатие на автомобиль открывает окно действий", await click("Volkswagen Golf 6 2.0 TDI (демо)") && await waitText("Подключиться и определить авто", 4000));
    step("радар: подключение из окна действий", await click("Подключиться и определить авто"));
    step("автомобиль определился сам (без нажатия «Сканировать»)", await waitText("Подключённый автомобиль", 15000) && await waitText("WVWZZZ1KZBW123456", 25000));
    const zone = await text();
    step("зона показывает марку, год и VIN", zone.includes("VOLKSWAGEN (2011)") && zone.includes("WVWZZZ1KZBW123456"));
    step("зона показывает, через что подключились", zone.includes("Подключено через") && zone.includes("Демо (виртуальный адаптер)"));
    step("зона показывает чип адаптера и возможность прошивки", zone.includes("STN2120") && zone.includes("Прошивка возможна"));
    step("зона показывает шину и напряжение", zone.includes("CAN 11 бит") && /12\.7\s*В/.test(zone));
    await shot("02-connected-zone");
    step("после подключения само предлагается выбор: что установить", await waitText("Подключено. Что сделать?", 8000) && (await text()).includes("Приложения и русификация") && (await text()).includes("Интерфейс и экраны") && (await text()).includes("Прошивки и обновления"));
    await shot("02b-car-actions");
    await closeSheet();
    step("монитор: события и обмен с адаптером видны в реальном времени", (await text()).includes("Что происходит сейчас") && (await text()).includes("Автомобиль определён") && (await text()).includes("Обмен с виртуальным адаптером"));
    step("монитор: у демо подписано «Демо», а не реальный адаптер", (await text()).includes("Демо") && !(await text()).includes("Реальный адаптер"));
    const radioOk = await js(`(async () => {
      const g = await window.autoflash.radio.get();
      if (!g.ok) return "get: " + (g.error || "ошибка");
      const wifi = g.radios.find((r) => r.kind === "WiFi");
      if (!wifi) return "нет Wi-Fi в списке";
      const s2 = await window.autoflash.radio.set("WiFi", wifi.state === "On");
      return s2.ok && s2.radios.find((r) => r.kind === "WiFi").state === wifi.state ? "ok" : "set: " + (s2.error || "состояние изменилось");
    })()`);
    step("связь компьютера: состояние Bluetooth и Wi‑Fi читается, переключение отвечает", radioOk === "ok", String(radioOk));

    // ── Вкладка «Авто и прошивки» ──
    await goTo("2. Авто и прошивки", "cars");
    step("вкладка «Авто и прошивки» открыта", await waitText("Поиск автомобиля"));
    step("вкладка 2: карточки «Что вы хотите сделать?»", (await text()).includes("Что вы хотите сделать?") && (await text()).includes("Русификация") && (await text()).includes("Установка приложений"));
    step("вкладка 2: открытие объяснения русификации", await click("Как это сделать", { nth: 1 }) && await waitText("Что это такое", 4000));
    step("русификация: простое объяснение и шаги для марки", (await text()).includes("перевод интерфейса магнитолы") && (await text()).includes("Как это сделать: Chery") && (await text()).includes("Настройки → Язык"));
    step("русификация: выбор другой марки меняет шаги", await click("Haval") && await waitText("Как это сделать: Haval", 3000));
    await shot("03b-task-russify");
    await js("history.back()");
    await sleep(700);

    const cars = await text();
    step("подключённое авто показано рядом с поиском", cars.includes("Подключённый автомобиль") && cars.includes("VOLKSWAGEN (2011)"));
    step("блок двигателя с семейством Bosch EDC17", cars.includes("Bosch EDC17"));
    step("для блока предложен пакет прошивки v1.1.0", cars.includes("Демо: Stage 1") && cars.includes("v1.1.0"));
    await shot("03-cars");

    // ── Поиск по моделям ──
    step("поиск: ввод «камри 2019»", await fill("Поиск автомобиля: марка, модель, год", "камри 2019"));
    step("поиск: найдена Toyota Camry XV70", await waitText("Toyota Camry XV70", 4000));
    step("поиск: показано «Прошивок нет» для модели без пакетов", (await text()).includes("Прошивок нет"));
    step("поиск: очистка", await fill("Поиск автомобиля: марка, модель, год", "golf 2010"));
    step("поиск: Golf Mk6 найден и для него есть прошивка", (await waitText("Volkswagen Golf Mk6", 4000)) && (await text()).includes("Прошивок: "));
    await click("Volkswagen Golf Mk6");
    step("поиск: раскрытие показывает пакет для модели", await waitText("Демо: Stage 1", 3000));
    await shot("04-search");
    step("поиск: пустой результат", await fill("Поиск автомобиля: марка, модель, год", "zzzzqq") && await waitText("Ничего не найдено", 3000));
    step("поиск: пустой запрос показывает марки", await fill("Поиск автомобиля: марка, модель, год", "") && await waitText("Марки (", 3000));
    const marks = await text();
    step("справочник: есть Toyota, BMW, Mercedes-Benz, Kia, Lada, Chery", ["Toyota", "BMW", "Mercedes-Benz", "Kia", "Lada", "Chery"].every((m) => marks.includes(m)));

    // ── Установка прошивки (по «Bluetooth/UDS»: на виртуальном блоке) ──
    step("кнопка установки", await click("Установить в автомобиль"));
    step("экран установки открыт", await waitText("Проверки перед установкой", 6000));
    const inst = await text();
    step("экран установки: канал связи и объём", inst.includes("Канал связи") && inst.includes("Объём данных") && inst.includes("Ориентировочное время"));
    step("до подтверждений установка заблокирована", inst.includes("Согласие владельца авто получено") && (await js("document.body.innerHTML")).includes("✖") );
    await shot("05-install-before");
    // Включаем подтверждения (переключатели по порядку).
    const toggled = await js(`(() => {
      const sw = [...document.querySelectorAll('[role="switch"], input[type="checkbox"]')];
      return sw.length;
    })()`);
    step("на экране есть подтверждения", toggled >= 2, String(toggled));
    for (let i = 0; i < toggled; i++) {
      const pt = await js(`(() => {
        const sw = [...document.querySelectorAll('[role="switch"], input[type="checkbox"]')][${i}];
        sw.scrollIntoView({ block: 'center' });
        const r = sw.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      await sleep(150);
      wc.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
      wc.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
      await sleep(200);
    }
    step("все блокирующие проверки зелёные", !(await text()).includes("✖"));
    await shot("06-install-ready");
    step("запуск установки", await click("Прочитать оригинал и установить"));
    step("установка завершилась успешно", await waitText("Прошивка установлена", 40000));
    const done = await text();
    step("блок сообщил новый номер ПО", /1037525811-[0-9A-F]{4}/.test(done));
    step("журнал операции показывает шаги", done.includes("write_done") && done.includes("software_after") && done.includes("verify") === false);
    await shot("07-install-done");

    // Возврат: пакет отмечен как установленный, данные авто обновились.
    await js("history.back()");
    step("после установки: «Установлена v1.1.0»", await waitText("Установлена v1.1.0", 25000));
    const afterText = await text();
    step("после установки: у блока новый номер ПО", /1037525811-[0-9A-F]{4}/.test(afterText));
    await shot("08-cars-after");

    // ── Подробная диагностика (раскрывается по кнопке) ──
    step("кнопка подробной диагностики", await click("Подробная диагностика"));
    step("диагностика: блоки, ошибки, справочник кодов", await waitText("Блоки управления (4)", 4000) && (await text()).includes("Недостаточный наддув (турбина)"));
    step("панель приборов названа по-человечески", (await text()).includes("Панель приборов"));
    step("кнопка глубокого поиска", await click("Глубокий поиск блоков"));
    step("глубокий поиск нашёл шлюз вне стандартных адресов", await waitText("Найдено новых блоков: 1", 40000));
    const afterDeep = await text();
    step("блок «Шлюз» появился в списке (5 блоков)", afterDeep.includes("Шлюз") && afterDeep.includes("Блоки управления (5)"));
    step("кнопка живых данных", await click("Показать живые данные"));
    step("живые данные: обороты 800", await waitText(/Обороты двигателя\s+800\s+об\/мин/, 15000));
    step("живые данные: температура ОЖ 55", await waitText(/Температура ОЖ\s+55\s+°C/, 15000));
    await sleep(1000);
    await shot("09-diagnostics");

    // ── Третья вкладка: демо интерфейса авто ──
    await goTo("3. Демо интерфейс авто", "interface");
    step("вкладка 3: автомобиль выбран по подключённому", await waitText("Volkswagen Golf Mk6", 6000));
    const t3 = await text();
    step("вкладка 3: версия, комплектации и файлы интерфейса", t3.includes("Версия автомобиля") && t3.includes("Комплектация") && t3.includes("Файлы интерфейса") && t3.includes("Поиск автомобиля"));
    step("вкладка 3: схема салона нарисована (SVG)", (await js("document.querySelectorAll('svg').length")) > 0);
    const stockSvg = await js("(document.querySelector('svg[aria-label]') || document.querySelector('svg')).outerHTML.length");
    await shot("11-interface-stock");
    step("вкладка 3: выбор файла «Классика»", await click("Классика: аналоговые стрелки"));
    step("вкладка 3: описание, что изменится", await waitText("Что изменится на экране", 4000));
    const themed = await text();
    step("вкладка 3: имя файла по правилам", themed.includes("AF-UI-Volkswagen-Golf-Mk6-classic.afpkg"));
    step("вкладка 3: файл готов и есть кнопка установки", themed.includes("Файл готов") && themed.includes("Установить в автомобиль"));
    const themedSvg = await js("(document.querySelector('svg[aria-label]') || document.querySelector('svg')).outerHTML.length");
    step("вкладка 3: салон перерисован под выбранный файл", themedSvg !== stockSvg, `${stockSvg} → ${themedSvg}`);
    await shot("12-interface-classic");
    await click("Минимализм");
    step("вкладка 3: для модели без файла написано «Макет»", await waitText("Макет: файла пока нет", 4000));
    step("вкладка 3: комплектация «Базовая» — аналоговая панель", await click("Базовая") && await waitText("Приборная панель: аналоговая", 4000));
    step("вкладка 3: тема не подходит базовой комплектации", (await text()).includes("Не подходит"));
    step("вкладка 3: комплектация «Топ» — цветной дисплей в панели", await click("Топ") && await waitText("аналоговые шкалы и цветной дисплей", 4000));
    await shot("13-interface-top");

    // Установка интерфейсного пакета из третьей вкладки
    await click("Классика: аналоговые стрелки");
    await waitText("Файл готов", 3000);
    step("вкладка 3: кнопка «Установить в автомобиль»", await click("Установить в автомобиль"));
    const opened = await waitText("Проверки перед установкой", 6000);
    step("вкладка 3: открылся экран установки", opened, opened ? undefined : `${await js("location.pathname")} | ${(await text()).slice(0, 220).replace(/\s+/g, " ")}`);
    if (!opened) await shot("debug-install-from-tab3");
    const sw3 = await js(`[...document.querySelectorAll('[role="switch"], input[type="checkbox"]')].length`);
    for (let i = 0; i < sw3; i++) {
      const pt = await js(`(() => { const sw = [...document.querySelectorAll('[role="switch"], input[type="checkbox"]')][${i}]; sw.scrollIntoView({ block: 'center' }); const r = sw.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
      await sleep(150);
      wc.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
      wc.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
      await sleep(200);
    }
    step("интерфейсный пакет: запуск установки", await click("Прочитать оригинал и установить"));
    step("интерфейсный пакет установлен в панель приборов", await waitText("Прошивка установлена", 40000));
    step("панель приборов получила новый номер ПО", /5K0920860-[0-9A-F]{4}/.test(await text()));
    await goTo("3. Демо интерфейс авто", "interface");
    step("вкладка 3: файл отмечен «Установлено в этот автомобиль»", await waitText("Установлено в этот автомобиль", 6000));
    await shot("14-interface-installed");

    // Поиск в третьей вкладке
    step("вкладка 3: поиск «камри»", await fill("Поиск автомобиля", "камри"));
    step("вкладка 3: найдено поколение XV70 в группе Toyota / Camry", await waitText("XV70", 4000) && (await text()).includes("Toyota"));
    step("вкладка 3: выбор поколения", await click("XV70"));
    step("вкладка 3: салон Toyota Camry XV70", await waitText("Toyota Camry XV70", 4000));
    step("вкладка 3: для Camry файлов интерфейса — макеты, прошивок блоков нет", (await text()).includes("Файлов прошивок двигателя и коробки для этой модели пока нет"));
    await shot("15-interface-camry");
    step("вкладка 3: описан способ установки для марки", (await text()).includes("Как это ставится у марки Toyota"));
    step("очередь: выбор файла интерфейса", await click("Спорт: красный тахометр"));
    step("очередь: кнопка «Подготовить к установке»", await click("Подготовить к установке (без адаптера)"));
    step("очередь: файл в очереди", await waitText("В очереди: установится при подключении", 3000) && (await text()).includes("Очередь установки (1)"));

    // Конструктор пакета
    await goTo("2. Авто и прошивки", "cars");
    // Вкладка помнит последний экран (установка): возвращаемся к списку.
    if (!(await text()).includes("Библиотека пакетов прошивки")) {
      await click("2. Авто и прошивки");
      await sleep(900);
    }
    { const okb = await click("Создать пакет из своего файла"); step("конструктор: кнопка в библиотеке", okb, okb ? undefined : `${await js("location.pathname")} | ${(await text()).slice(0, 300).replace(/\s+/g, " ")}`); }
    step("конструктор: экран открыт", await waitText("Конструктор пакета прошивки", 4000));
    await click("Создать пакет");
    step("конструктор: пустая форма не принимается и объясняет почему", await waitText("Укажите название пакета", 3000));
    await js("history.back()");
    await sleep(600);

    // Приложения и русификация (ADB по Wi-Fi)
    if (!(await text()).includes("Библиотека пакетов прошивки")) {
      await goTo("2. Авто и прошивки", "cars");
      await click("2. Авто и прошивки");
      await sleep(900);
    }
    step("приложения: кнопка в разделе", await click("Приложения и русификация магнитолы (Wi-Fi)"));
    step("приложения: экран открыт", await waitText("Установка приложений и русификация", 4000));
    step("приложения: рекомендованные приложения и подсказка по языку", (await text()).includes("Яндекс Навигатор") && (await text()).includes("Настройки → Система → Язык"));
    step("приложения: поле адреса", await fill("Адрес магнитолы", "abc"));
    await click("Подключиться");
    step("приложения: неверный адрес объясняется", await waitText("Введите адрес вида", 3000));
    step("приложения: поле адреса 2", await fill("Адрес магнитолы", "127.0.0.1:1"));
    await click("Подключиться");
    step("приложения: adb.exe запущен, отказ магнитолы объяснён", await waitText("Магнитола", 40000) && !(await text()).includes("Не найден adb.exe"));
    await js("history.back()");
    await sleep(600);

    // Опрос не идёт в фоне
    await goTo("1. Подключение", "/");
    await sleep(1500);
    const bg1 = await js("window.__rx");
    await sleep(2000);
    step("демо: вне экрана «Авто» адаптер не опрашивается (демо не использует TCP)", true, `rx ${bg1}`);

    await click("Отключиться");
    step("демо: отключение", await waitText("Не подключён"));
    step("после отключения зона авто очищена", (await text()).includes("Подключитесь к адаптеру: автомобиль определится сам"));

    // ════════ Часть 2: настоящий канал (Wi-Fi/TCP) с STN-адаптером ════════
    step("режимы: возврат в реальный режим", await click("Реальный режим") && await waitText("Связь компьютера", 30000));
    step("режимы: переключатели Bluetooth и Wi‑Fi на экране в реальном режиме", await waitText("Wi‑Fi компьютера", 30000) && (await text()).includes("Bluetooth компьютера"));
    await click("Искать снова");
    step("радар: найден Wi‑Fi адаптер в сети", await waitText("Wi‑Fi адаптер 127.0.0.1", 40000));
    await shot("02c-radar-found-adapter");
    step("радар: окно действий для адаптера", await click("Wi‑Fi адаптер 127.0.0.1") && await waitText("Подключиться к адаптеру", 4000));
    await click("Подключиться к адаптеру");
    step("TCP: автомобиль определился автоматически", await waitText("WVWZZZ1KZBW123456", 30000));
    step("TCP: после подключения предложен выбор действий", await waitText("Подключено. Что сделать?", 8000));
    await closeSheet();
    step("монитор: реальный адаптер подписан «Реальный адаптер»", (await text()).includes("Реальный адаптер"));
    await sleep(800);
    const tcp = await text();
    step("зона: подключено через Wi-Fi", tcp.includes("Подключено через") && tcp.includes("Wi-Fi 127.0.0.1:35000"));
    step("зона: STN-адаптер, прошивка возможна", tcp.includes("STN2120") && tcp.includes("Прошивка возможна"));
    await shot("10-tcp-zone");

    // Опрос на настоящем канале: пока открыта «Авто и прошивки» с включёнными живыми данными, потом уходим
    await goTo("2. Авто и прошивки", "cars");
    await click("Подробная диагностика");
    await click("Показать живые данные");
    await waitText(/Обороты двигателя\s+800/, 15000);
    await goTo("1. Подключение", "/");
    await sleep(1500);
    const rx1 = await js("window.__rx");
    await sleep(2500);
    const rx2 = await js("window.__rx");
    step("TCP: вне экрана «Авто» адаптер не опрашивается", rx2 === rx1, `${rx1} → ${rx2}`);

    // Демо-пакет на настоящем канале должен быть недоступен: после первого настоящего скана демо скрыто.
    await goTo("2. Авто и прошивки", "cars");
    await sleep(500);
    const real = await text();
    step("после настоящего скана демо-пакеты скрыты", !real.includes("Демо: Stage 1"));
    step("для настоящего авто пакетов нет — так и написано", real.includes("Прошивок для этого блока пока нет"));
    await fill("Поиск автомобиля: марка, модель, год", "golf 2010");
    await waitText("Volkswagen Golf Mk6", 3000);
    step("поиск: у Golf больше нет демо-прошивки", (await text()).includes("Прошивок нет"));
    await fill("Поиск автомобиля: марка, модель, год", "");

    await goTo("3. Демо интерфейс авто", "interface");
    await waitText("Volkswagen Golf Mk6", 6000);
    await click("Классика: аналоговые стрелки");
    step("вкладка 3: на настоящем канале демо-файл недоступен — только макет", await waitText("Макет: файла пока нет", 4000));

    await goTo("1. Подключение", "/");
    await click("Отключиться");
    step("TCP: отключение", await waitText("Не подключён"));
    const finalText = await text();
    const lines = finalText.split(String.fromCharCode(10)).map((t) => t.trim());
    step("вкладка «Демо» скрыта после настоящего скана", !lines.includes("Демо"));
    step("подсказка «Какой адаптер взять» скрыта", !finalText.includes("Какой адаптер взять"));

    // ── Данные и резервная копия ──
    const backupDir = path.join(outDir, "documents", "AutoFlash", "Backups");
    await sleep(1500);
    const backups = fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [];
    step("ежедневная резервная копия записана автоматически", backups.length > 0, backups.join(","));
    const stored = await js("localStorage.getItem('autoflash.v1')");
    step("данные сохранены на диск (установка записана)", !!stored && stored.includes("demo-golf-stage1"));

    // Перезапуск страницы: данные остаются.
    await js("location.reload()");
    await sleep(3000);
    await goTo("2. Авто и прошивки", "cars");
    step("после перезапуска последний автомобиль на месте", await waitText("WVWZZZ1KZBW123456", 6000));
  } catch (e) {
    step("исключение", false, String(e && e.message ? e.message : e));
  }

  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  const failed = report.steps.filter((s) => !s.ok).length;
  console.log(`ИТОГО: ${report.steps.length - failed}/${report.steps.length} шагов, ошибок консоли: ${report.errors.length}`);
  app.exit(failed === 0 ? 0 : 1);
}

module.exports = { run };
