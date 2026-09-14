#!/usr/bin/env node
// Слушает (ТОЛЬКО читает, никогда не пишет) сообщения в Telegram-группах с
// вашего личного аккаунта через MTProto (не Bot API — обычного бота нельзя
// добавить в закрытые группы без приглашения, а с личного аккаунта это
// стандартный сценарий чтения). Когда видит сообщение, похожее на заказ,
// пересылает вам уведомление через ВАШЕГО ЖЕ Bot API бота — сам ничего
// не отвечает ни в группе, ни в личку автору поста.
//
// ⚠️ БЕЗОПАСНОСТЬ: файл сессии (data/telegram-user.session) даёт ПОЛНЫЙ
// доступ к вашему личному Telegram-аккаунту — по чувствительности это как
// пароль, даже хуже (действует и без повторного ввода 2FA). Никогда не
// коммитьте, не публикуйте, не пересылайте этот файл. Он уже в .gitignore.
//
// Настройка (один раз):
//   1. https://my.telegram.org → API development tools → создать приложение
//      (бесплатно, нужен только номер телефона) → скопировать api_id и api_hash.
//   2. В .env.local прописать:
//        TELEGRAM_API_ID=...
//        TELEGRAM_API_HASH=...
//        TELEGRAM_WATCH_CHATS=@группа1,@группа2   (юзернеймы групп для слежки —
//          без этого списка скрипт не запустится, чтобы случайно не начать
//          читать ваши личные переписки с друзьями)
//   3. node scripts/group-listener.mjs — при первом запуске попросит номер
//      телефона, код из Telegram и пароль 2FA (если включён; ввод кода и
//      пароля скрыт — ничего не отображается на экране, даже звёздочками,
//      это осознанный выбор ради максимальной безопасности). Дальше сессия
//      сохранится и повторный вход не понадобится.
//   4. Скрипт должен работать постоянно — это не функция на Vercel, а живой
//      процесс, слушающий события в реальном времени (открытый терминал,
//      pm2, или процесс на компьютере, который не выключается).
//
// Автопоиск новых групп (по умолчанию включён, см. discoverAndJoin ниже):
// раз в несколько часов ищет публичные группы по ключевым словам и вступает
// максимум в MAX_JOINS_PER_DAY за сутки — специально медленно и вразнобой,
// чтобы поведение не выглядело как спам-бот для антиспам-системы Telegram.
// Отключить: AUTO_DISCOVER_GROUPS=false в .env.local.

import { TelegramClient, Api } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { NewMessage, Raw } from "teleproto/events/index.js";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const SESSION_FILE = "data/telegram-user.session";
const DISCOVERY_STATE_FILE = "data/group-discovery-state.json";

const CTRL_C = "";
const BACKSPACE_1 = "";
const BACKSPACE_2 = "";

// Признаки, что автор поста САМ ПРЕДЛАГАЕТ услугу (бизнес/мастер), а не
// ищет исполнителя себе. Это и есть наш лид — у него уже есть поток заявок,
// который можно автоматизировать. Обычных людей, которые просто ищут мастера
// себе («ищу мастера маникюра»), намеренно НЕ ловим — им наш продукт не нужен,
// мы продаём бизнесам, а не частным лицам. Та же логика, что в
// lib/groupWatcher.ts (у обычного бота) — продублирована здесь, потому что
// это отдельный долгоживущий процесс, а не часть Next.js-приложения.
const PROVIDER_SIGNALS = [
  "предлага",
  "оказыва",
  "выполня",
  "принимаю запис",
  "принимаем запис",
  "запись открыт",
  "свободн окошк",
  "свободные окна",
  "ищу клиентов",
  "в поиске клиентов",
  "набираю клиентов",
  "нужны клиенты",
  "стаж работы",
  "портфолио",
  "звоните",
  "пишите в директ",
  "пишите в лс",
  "запись в директ",
  "услуги мастера",
  "мастер по ",
  "работаю на дому",
  "выезд на дом",
  "с выездом",
  "профессионально сделаю",
];

// Та же логика, что в lib/groupWatcher.ts (у обычного бота) — продублирована
// здесь, потому что это отдельный долгоживущий процесс, а не часть Next.js-приложения.
const NICHE_INFO = {
  auto: { label: "СТО и автомойки", icon: "🚗", objectName: "ИИ-приёмщик", keywords: ["автосервис", "автомойк", "ремонт авто", "шиномонтаж", "мастер по авто"], description: "отвечает клиентам в WhatsApp и Telegram 24/7, консультирует по цене ремонта и сам записывает на удобное время" },
  clinic: { label: "Медицинские клиники", icon: "🩺", objectName: "ИИ-приёмщик", keywords: ["клиник", "стоматолог", "врач", "массажист"], description: "отвечает пациентам 24/7, подсказывает по услугам и сам записывает на приём" },
  beauty: { label: "Салоны красоты", icon: "💇", objectName: "ИИ-приёмщик", keywords: ["маникюр", "парикмахер", "бровист", "лешмейкер", "салон красоты", "мастер по волосам"], description: "отвечает клиентам в WhatsApp и Telegram 24/7, консультирует по услугам и сам записывает на удобное время" },
  hotel: { label: "Отели", icon: "🏨", objectName: "ИИ-приёмщик", keywords: ["отель", "гостиниц", "хостел"], description: "отвечает на бронирования 24/7 и сам подтверждает даты заезда" },
  realty: { label: "Аренда недвижимости", icon: "🏠", objectName: "ИИ-приёмщик", keywords: ["квартир", "риелтор", "недвижимост", "снять жиль", "сдать жиль"], description: "отвечает на вопросы по объектам 24/7 и сам назначает просмотры" },
  "it-company": { label: "IT-компании", icon: "💻", objectName: "ИИ-сисадмин", keywords: ["программист", "разработчик", "it-компан", "айти компан"], description: "мониторит сервисы и логи, перехватывает ошибки и сам перезапускает упавшие процессы" },
  "web-studio": { label: "Веб-студии", icon: "🛠️", objectName: "ИИ-сисадмин", keywords: ["сайт сделать", "лендинг", "разработка сайта", "веб-студия"], description: "следит за сервисами клиентов и сразу сообщает дежурному о сбоях" },
  retail: { label: "Ритейл", icon: "🛍️", objectName: "ИИ-аналитик", keywords: ["поставщик", "купить оптом"], description: "переводит вопросы в SQL-запрос и выдаёт отчёт по выручке или остаткам за секунды" },
  warehouse: { label: "Складская логистика", icon: "🚚", objectName: "ИИ-аналитик", keywords: ["склад ", "складск", "логистика"], description: "мгновенно считает остатки и формирует отчёты без ручной сверки" },
  "online-school": { label: "Онлайн-школы", icon: "🎓", objectName: "ИИ-модератор", keywords: ["репетитор", "курсы английск", "преподаватель", "онлайн школа"], description: "отвечает на частые вопросы в чате и сразу пересылает горячие заявки в отдел продаж" },
};

// Вопросы про сам наш продукт (цена, сроки, поддержка) — та же логика, что
// FAQ_RULES/matchFaq в lib/telegramBot.ts, продублирована здесь по той же
// причине (плоский node-скрипт вне Next.js). Используется для автоподсказок,
// когда реальный клиент пишет вам в личку с вашего аккаунта, — см. main().
const FAQ_RULES = [
  {
    keywords: ["цен", "стоимост", "сколько сто", "почем"],
    answer:
      "Стоимость зависит от сложности процессов вашего бизнеса — точную цифру назовём на коротком созвоне после разбора задачи. Хотите, запишу вас на такой созвон? Напишите имя и телефон.",
  },
  {
    keywords: ["срок", "сколько времени", "как быстро", "когда запуст"],
    answer: "Обычно внедрение занимает 3-5 рабочих дней с момента созвона до запуска.",
  },
  {
    keywords: ["сломает", "поддержк", "если что-то", "гаранти"],
    answer: "Мы мониторим работу автоматизации и оперативно чиним сбои — это входит в сопровождение, отдельно платить не нужно.",
  },
  {
    keywords: ["настраива", "сам", "что от меня", "нужно ли мне"],
    answer: "Всю техническую настройку берём на себя. От вас — доступ к нужным каналам (например, WhatsApp Business) и 15 минут на созвон.",
  },
];

function matchFaq(text) {
  const normalized = text.toLowerCase();
  for (const rule of FAQ_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) return rule.answer;
  }
  return null;
}

const SITE_DEMO_LINK = process.env.SITE_URL
  ? `${process.env.SITE_URL.replace(/\/$/, "")}/#products`
  : "https://ai-automation-agency-swart.vercel.app/#products";

function escapeHtml(input) {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function detectGroupRequest(text) {
  const normalized = text.toLowerCase();
  const hasProviderSignal = PROVIDER_SIGNALS.some((word) => normalized.includes(word));
  if (!hasProviderSignal) return null;

  for (const [slug, info] of Object.entries(NICHE_INFO)) {
    const matchedKeyword = info.keywords.find((keyword) => normalized.includes(keyword));
    if (matchedKeyword) return { slug, info, matchedKeyword };
  }
  return null;
}

function buildPitch(info, authorName) {
  const greeting = authorName ? `Здравствуйте, ${authorName}!` : "Здравствуйте!";
  return (
    `${greeting} Увидел ваше объявление про «${info.label.toLowerCase()}». ` +
    `Обычно на таких объявлениях часть обращений теряется или на них долго отвечают. ` +
    `Мы делаем ${info.objectName}: ${info.description}. ` +
    `Можно посмотреть живое демо для вашей сферы: ${SITE_DEMO_LINK}`
  );
}

/** Только определение ниши по ключевым словам, без требования "признака
 * бизнеса" (PROVIDER_SIGNALS) — используется для ваших СОБСТВЕННЫХ черновиков
 * исходящих сообщений, там это не нужно (вы и так знаете, что пишете сами). */
function detectNicheInText(text) {
  const normalized = text.toLowerCase();
  for (const [slug, info] of Object.entries(NICHE_INFO)) {
    const matchedKeyword = info.keywords.find((keyword) => normalized.includes(keyword));
    if (matchedKeyword) return { slug, info, matchedKeyword };
  }
  return null;
}

function buildDraftSuggestion(info) {
  return (
    `Здравствуйте! Пишу вам от Автопилот.AI. Мы делаем ${info.objectName} для сферы «${info.label.toLowerCase()}»: ` +
    `${info.description}. Можно за 2 минуты показать, как это работает для вашей сферы — вот живое демо: ${SITE_DEMO_LINK}`
  );
}

async function notifyBot(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ownerId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !ownerId) {
    console.error("TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID не заданы — уведомление не отправлено.");
    return;
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: ownerId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) {
    console.error("Не удалось отправить уведомление:", await response.text());
  }
}

/**
 * Спрашивает ввод, ничего не отображая на экране — ни символов, ни звёздочек.
 * Для максимальной безопасности (пароль 2FA, код входа) лучше, чем обычный
 * readline.question, который показывает вводимое открытым текстом.
 * Если stdin не терминал (например, запуск не интерактивно) — падает назад
 * на обычный видимый ввод через readline, иначе зависнет намертво.
 */
function askHidden(promptText) {
  if (!stdin.isTTY) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    return rl.question(promptText).finally(() => rl.close());
  }

  return new Promise((resolve) => {
    stdout.write(promptText);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    }

    function onData(chunk) {
      const char = chunk.toString();
      if (char === "\r" || char === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
      } else if (char === CTRL_C) {
        cleanup();
        stdout.write("\n");
        process.exit(130);
      } else if (char === BACKSPACE_1 || char === BACKSPACE_2) {
        if (value.length > 0) value = value.slice(0, -1);
      } else if (char >= " ") {
        value += char;
      }
    }

    stdin.on("data", onData);
  });
}

const SEARCH_QUERIES = [
  "объявления Алматы",
  "услуги Алматы чат",
  "объявления Астана",
  "услуги Астана чат",
  "СТО Алматы чат",
  "мастер маникюра Алматы",
  "ремонт квартир Алматы",
  "недвижимость Алматы чат",
  "IT вакансии Алматы",
  "фриланс заказы Казахстан",
  "услуги Шымкент",
  "объявления Караганда",
];

const AUTO_DISCOVER = process.env.AUTO_DISCOVER_GROUPS !== "false";
const DISCOVERY_INTERVAL_MS = Number(process.env.DISCOVERY_INTERVAL_MINUTES || 240) * 60 * 1000;
const MAX_JOINS_PER_DAY = Number(process.env.MAX_JOINS_PER_DAY || 3);
const MAX_TOTAL_GROUPS = Number(process.env.MAX_TOTAL_GROUPS || 150);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadDiscoveryState() {
  if (!existsSync(DISCOVERY_STATE_FILE)) {
    return { date: todayStr(), joinedToday: 0, joinedGroups: [] };
  }
  const saved = JSON.parse(readFileSync(DISCOVERY_STATE_FILE, "utf-8"));
  if (saved.date !== todayStr()) {
    return { date: todayStr(), joinedToday: 0, joinedGroups: saved.joinedGroups || [] };
  }
  return saved;
}

function saveDiscoveryState(state) {
  writeFileSync(DISCOVERY_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Ищет ОДНУ новую публичную группу по случайному ключевому запросу и
 * вступает в неё — не больше MAX_JOINS_PER_DAY раз в сутки, с большими
 * паузами между попытками (см. scheduleDiscovery). Это сознательно медленно:
 * массовое быстрое вступление в десятки групп — типичный признак спам-бота
 * для антиспам-системы Telegram, а мы стараемся вести себя как обычный
 * живой человек, который время от времени находит и вступает в чат.
 * Никогда не трогает приватные/инвайт-группы — только публичные, с юзернеймом,
 * куда и так может вступить кто угодно по ссылке.
 */
async function discoverAndJoin(client) {
  const state = loadDiscoveryState();
  if (state.joinedToday >= MAX_JOINS_PER_DAY) {
    console.log(`[автопоиск] Дневной лимит (${MAX_JOINS_PER_DAY}) уже исчерпан — жду следующего дня.`);
    return;
  }

  const dialogs = await client.getDialogs({ limit: 300 });
  const groupCount = dialogs.filter((d) => d.isGroup || d.isChannel).length;
  lastKnownGroupCount = groupCount;
  if (groupCount >= MAX_TOTAL_GROUPS) {
    console.log(`[автопоиск] Уже состою в ${groupCount} группах (лимит ${MAX_TOTAL_GROUPS}) — новые не ищу.`);
    return;
  }
  const known = new Set(dialogs.map((d) => d.entity?.username?.toLowerCase()).filter(Boolean));

  const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
  console.log(`[автопоиск] Ищу по запросу: «${query}»`);

  let result;
  try {
    result = await client.invoke(new Api.contacts.Search({ q: query, limit: 15 }));
  } catch (error) {
    console.error("[автопоиск] Ошибка поиска:", error.message);
    return;
  }

  const candidate = (result.chats || []).find((chat) => {
    const isGroupLike = chat.megagroup === true || chat.className === "Chat";
    const hasUsername = Boolean(chat.username);
    return isGroupLike && !chat.broadcast && hasUsername && !known.has(chat.username.toLowerCase());
  });

  if (!candidate) {
    console.log("[автопоиск] Ничего нового по этому запросу не нашлось.");
    return;
  }

  try {
    await client.invoke(new Api.channels.JoinChannel({ channel: candidate.username }));
    state.joinedToday += 1;
    state.joinedGroups.push({
      title: candidate.title,
      username: candidate.username,
      query,
      joinedAt: new Date().toISOString(),
    });
    saveDiscoveryState(state);
    console.log(
      `[автопоиск] Вступил в «${candidate.title}» (@${candidate.username}) — сегодня ${state.joinedToday}/${MAX_JOINS_PER_DAY}.`,
    );
    await notifyBot(
      `➕ Автоматически вступил в новую группу для мониторинга заказов:\n«${escapeHtml(candidate.title)}» (@${candidate.username})\n\nЕсли группа не подходит — выйдите из неё вручную в Telegram.`,
    );
  } catch (error) {
    console.error(`[автопоиск] Не удалось вступить в «${candidate.title}»:`, error.message);
  }
}

/** Периодически, с рандомным разбросом (не строго по расписанию), пробует найти и вступить в одну новую группу. */
function scheduleDiscovery(client) {
  const jitter = () => DISCOVERY_INTERVAL_MS * (0.7 + Math.random() * 0.6);

  async function tick() {
    try {
      await discoverAndJoin(client);
    } catch (error) {
      console.error("[автопоиск] Неожиданная ошибка:", error.message);
    }
    await writeHeartbeat();
    setTimeout(tick, jitter());
  }

  console.log(
    `[автопоиск] Включён: до ${MAX_JOINS_PER_DAY} новых групп в сутки, проверка примерно раз в ` +
      `${Math.round(DISCOVERY_INTERVAL_MS / 60000)} мин (с разбросом). Отключить — AUTO_DISCOVER_GROUPS=false.`,
  );
  setTimeout(tick, jitter());
}

function getSql() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

let lastKnownGroupCount = null;

/** Пишет текущее состояние в system_status, чтобы бот мог ответить на /status в Telegram. */
async function writeHeartbeat(extra = {}) {
  const sql = getSql();
  if (!sql) return;

  const discovery = loadDiscoveryState();
  const value = {
    autoDiscover: AUTO_DISCOVER,
    watchMode: extra.watchMode ?? undefined,
    maxJoinsPerDay: MAX_JOINS_PER_DAY,
    joinedToday: discovery.joinedToday,
    discoveryIntervalMinutes: Math.round(DISCOVERY_INTERVAL_MS / 60000),
    maxTotalGroups: MAX_TOTAL_GROUPS,
    groupCount: lastKnownGroupCount,
    startedAt: extra.startedAt ?? undefined,
    ...extra,
  };

  try {
    await sql`
      INSERT INTO system_status (key, value, updated_at)
      VALUES ('group_listener', ${JSON.stringify(value)}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(value)}::jsonb, updated_at = now()
    `;
  } catch (error) {
    console.error("Не удалось записать heartbeat:", error.message);
  }
}

async function pushToDb(row) {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = neon(url);
  try {
    await sql`
      INSERT INTO group_leads (chat_id, chat_title, message_id, niche, business_label, message_text, sender_username, sender_name, pitch)
      VALUES (${row.chatId}, ${row.chatTitle}, ${row.messageId}, ${row.niche}, ${row.businessLabel}, ${row.text}, ${row.senderUsername}, ${row.senderName}, ${row.pitch})
      ON CONFLICT (chat_id, message_id) DO NOTHING
    `;
  } catch (error) {
    console.error("Не удалось сохранить в базу:", error.message);
  }
}

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const watchChatsRaw = process.env.TELEGRAM_WATCH_CHATS;

  if (!apiId || !apiHash) {
    console.error(
      "Не заданы TELEGRAM_API_ID / TELEGRAM_API_HASH. Получите бесплатно на https://my.telegram.org " +
        "(API development tools) и пропишите в .env.local.",
    );
    process.exit(1);
  }

  // TELEGRAM_WATCH_CHATS не задан, пустой, "*" или похож на плейсхолдер из
  // документации ("@группа1,@группа2") — считаем, что нужен режим "все группы".
  // Личные переписки (isPrivate) в этом режиме всё равно не читаются — см. ниже.
  const looksLikePlaceholder = watchChatsRaw?.includes("группа1");
  const allGroupsMode = !watchChatsRaw || watchChatsRaw.trim() === "*" || looksLikePlaceholder;
  const watchChats = allGroupsMode
    ? null
    : watchChatsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (allGroupsMode) {
    console.log(
      "TELEGRAM_WATCH_CHATS не задан (или похож на пример из документации) — слушаю ВСЕ группы, " +
        "где состоит аккаунт. Личные переписки не читаются.",
    );
  }

  mkdirSync("data", { recursive: true });
  const savedSession = existsSync(SESSION_FILE) ? readFileSync(SESSION_FILE, "utf-8").trim() : "";
  const session = new StringSession(savedSession);
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const phoneNumber = savedSession ? "" : await rl.question("Номер телефона (+7...): ");
  rl.close();

  await client.start({
    phoneNumber: () => phoneNumber,
    password: () => askHidden("Пароль 2FA (если не включён — просто Enter): "),
    phoneCode: () => askHidden("Код из Telegram (ввод скрыт): "),
    onError: (err) => console.error(err),
  });

  writeFileSync(SESSION_FILE, client.session.save(), "utf-8");
  console.log(`Сессия сохранена в ${SESSION_FILE} — при следующем запуске повторный вход не понадобится.`);
  console.log(allGroupsMode ? "Слушаю: все группы\n" : `Слушаю группы: ${watchChats.join(", ")}\n`);

  client.addEventHandler(async (event) => {
    try {
      // Личные переписки не читаем ни в каком режиме — только группы/супергруппы.
      if (event.isPrivate) return;

      const message = event.message;
      if (!message?.message) return;

      const match = detectGroupRequest(message.message);
      if (!match) return;

      const chat = await message.getChat();
      const chatTitle = chat?.title || String(message.chatId);
      const sender = await message.getSender();
      const senderName = sender?.firstName || sender?.title || null;
      const senderUsername = sender?.username ? `@${sender.username}` : null;

      const pitch = buildPitch(match.info, senderName);

      await pushToDb({
        chatId: Number(message.chatId),
        chatTitle,
        messageId: message.id,
        niche: match.slug,
        businessLabel: match.info.label,
        text: message.message,
        senderUsername,
        senderName,
        pitch,
      });

      const alert = [
        "👀 Похоже на заказ в группе (с личного аккаунта)",
        `Группа: ${escapeHtml(chatTitle)}`,
        `Ниша: ${match.info.icon} ${match.info.label}`,
        `Автор: ${escapeHtml(senderName || "?")} ${senderUsername ?? ""}`.trim(),
        `Сообщение: ${escapeHtml(message.message)}`,
        "",
        `Черновик ответа:\n${escapeHtml(pitch)}`,
      ].join("\n");

      await notifyBot(alert);
      console.log(`[${new Date().toLocaleTimeString("ru-RU")}] Найден заказ в «${chatTitle}»: ${match.slug}`);
    } catch (error) {
      console.error("Ошибка обработки сообщения:", error.message);
    }
  }, new NewMessage(watchChats ? { chats: watchChats } : {}));

  // Личные переписки: когда реальный человек пишет вам в личку с вашего
  // аккаунта, и его сообщение похоже на типовой вопрос про наш продукт
  // (цена/сроки/поддержка) — сразу присылаем вам подсказку через бота.
  // Молчим, если совпадения нет — чтобы не превращать личные чаты с друзьями
  // в поток лишних уведомлений. Ничего никуда не сохраняем и не отвечаем сами.
  client.addEventHandler(async (event) => {
    try {
      if (!event.isPrivate) return;

      const message = event.message;
      if (!message?.message || message.out) return; // свои же сообщения игнорируем

      const suggestion = matchFaq(message.message);
      if (!suggestion) return;

      const sender = await message.getSender();
      if (sender?.bot) return;
      const senderName = sender?.firstName || null;
      const senderUsername = sender?.username ? `@${sender.username}` : null;

      const alert = [
        "💡 Подсказка для личного чата",
        `От: ${escapeHtml(senderName || "?")} ${senderUsername ?? ""}`.trim(),
        `Сообщение: ${escapeHtml(message.message)}`,
        "",
        `Возможный ответ:\n${escapeHtml(suggestion)}`,
      ].join("\n");

      await notifyBot(alert);
      console.log(`[${new Date().toLocaleTimeString("ru-RU")}] Подсказка для личного чата с ${senderName ?? "?"}`);
    } catch (error) {
      console.error("Ошибка обработки личного сообщения:", error.message);
    }
  }, new NewMessage({ incoming: true }));

  // Черновики: пока вы ЕЩЁ ПЕЧАТАЕТЕ первое сообщение новому человеку (не
  // отправили), Telegram синхронизирует черновик между вашими устройствами —
  // мы это видим с вашего аккаунта и, если в тексте узнаём нишу, присылаем
  // через бота более полный/готовый вариант, который можно использовать
  // вместо или вместе с тем, что вы пишете. Дебаунс — не чаще раза в
  // ~1.5 сек после паузы в наборе, чтобы не слать подсказку на каждую букву.
  // Молчим, если ниша не распознана — не гадаем на пустом месте.
  const draftTimers = new Map();
  const lastSuggestedDraft = new Map();

  client.addEventHandler(async (update) => {
    try {
      if (update.className !== "UpdateDraftMessage") return;
      if (!update.peer || update.peer.className !== "PeerUser") return; // только личные чаты
      const draft = update.draft;

      const userId = update.peer.userId.toString();

      if (!draft || draft.className !== "DraftMessage" || !draft.message) {
        // Черновик очистили (отправили или стёрли) — сбрасываем защиту от повтора.
        lastSuggestedDraft.delete(userId);
        if (draftTimers.has(userId)) {
          clearTimeout(draftTimers.get(userId));
          draftTimers.delete(userId);
        }
        return;
      }

      const text = draft.message;

      if (draftTimers.has(userId)) clearTimeout(draftTimers.get(userId));
      draftTimers.set(
        userId,
        setTimeout(async () => {
          draftTimers.delete(userId);
          try {
            if (lastSuggestedDraft.get(userId) === text) return; // уже подсказывали на этот же текст

            const match = detectNicheInText(text);
            if (!match) return;

            lastSuggestedDraft.set(userId, text);

            let contactName = null;
            try {
              const entity = await client.getEntity(update.peer.userId);
              contactName = entity?.firstName || (entity?.username ? `@${entity.username}` : null);
            } catch {
              // не критично, просто не подпишем имя
            }

            const suggestion = buildDraftSuggestion(match.info);
            const alert = [
              "✍️ Заметил, что вы пишете новому контакту" + (contactName ? ` (${escapeHtml(contactName)})` : ""),
              `Похоже на нишу: ${match.info.icon} ${match.info.label}`,
              "",
              `Более полный вариант, если нужен:\n${escapeHtml(suggestion)}`,
            ].join("\n");

            await notifyBot(alert);
            console.log(`[${new Date().toLocaleTimeString("ru-RU")}] Подсказка по черновику (${match.slug})`);
          } catch (error) {
            console.error("Ошибка обработки черновика:", error.message);
          }
        }, 1800),
      );
    } catch (error) {
      console.error("Ошибка обработки UpdateDraftMessage:", error.message);
    }
  }, new Raw({ types: [Api.UpdateDraftMessage] }));

  const startedAt = new Date().toISOString();
  const watchMode = allGroupsMode ? "all" : `list:${watchChats.length}`;

  try {
    const dialogs = await client.getDialogs({ limit: 300 });
    lastKnownGroupCount = dialogs.filter((d) => d.isGroup || d.isChannel).length;
  } catch (error) {
    console.error("Не удалось посчитать группы при старте:", error.message);
  }

  await writeHeartbeat({ startedAt, watchMode, online: true });
  setInterval(() => writeHeartbeat({ startedAt, watchMode, online: true }), 10 * 60 * 1000);

  process.on("SIGINT", async () => {
    console.log("\nОстанавливаюсь...");
    await writeHeartbeat({ startedAt, watchMode, online: false });
    process.exit(0);
  });

  if (AUTO_DISCOVER) {
    scheduleDiscovery(client);
  } else {
    console.log("[автопоиск] Отключён (AUTO_DISCOVER_GROUPS=false).");
  }

  console.log("Готово. Работаю и слушаю новые сообщения (Ctrl+C — остановить). Статус — командой /status боту в Telegram.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
