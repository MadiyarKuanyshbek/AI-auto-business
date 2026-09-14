import { products } from "@/lib/products";
import { sql } from "@/lib/db";
import { escapeHtml, type InlineKeyboard } from "@/lib/telegram";
import { formatPriceRange, PRICING } from "@/lib/pricing";

export const SITE_URL = process.env.SITE_URL
  ? process.env.SITE_URL.replace(/\/$/, "")
  : "https://ai-automation-agency-swart.vercel.app";

/** Название агентства как кликабельная ссылка на сайт — используется во всех
 * текстах бота, где упоминается бренд. Сообщение, где это есть, должно
 * отправляться с { html: true }, иначе разметка покажется как сырой текст. */
const BRAND_LINK = `<a href="${SITE_URL}">Автопилот.AI</a>`;

export function buildMenuLegend() {
  return products.map((p) => `${p.icon} <b>${p.menuLabel}</b> — ${p.menuHint}`).join("\n");
}

export function buildWelcomeText(firstName?: string) {
  const greeting = firstName ? `Здравствуйте, ${firstName}!` : "Здравствуйте!";
  return (
    `${greeting} Это ${BRAND_LINK} 👋\n\n` +
    `Мы настраиваем ИИ-администраторов, которые сами отвечают клиентам, записывают их и разгружают вас от рутины.\n\n` +
    `Нажмите на то, что ближе к вашей задаче — расскажу подробнее:\n\n${buildMenuLegend()}`
  );
}

export function buildMenuPromptText() {
  return `Выберите, что ближе к вашей задаче:\n\n${buildMenuLegend()}`;
}

export function buildMenuKeyboard(): InlineKeyboard {
  const rows: InlineKeyboard = [];
  for (let i = 0; i < products.length; i += 2) {
    const row = products
      .slice(i, i + 2)
      .map((p) => ({ text: `${p.icon} ${p.menuLabel}`, callback_data: `product:${p.id}` }));
    rows.push(row);
  }
  rows.push([{ text: "💬 У меня другой вопрос", callback_data: "faq" }]);
  return rows;
}

/** Второй уровень: после выбора продукта — конкретная сфера бизнеса (та же ниша, что в форме на сайте). */
export function buildNichePicker(productId: string): { text: string; keyboard: InlineKeyboard } | null {
  const product = products.find((p) => p.id === productId);
  if (!product) return null;

  const text = `${product.icon} <b>${product.title}</b>\n\nКакая у вас сфера?`;

  const rows: InlineKeyboard = [];
  for (let i = 0; i < product.businesses.length; i += 2) {
    const row = product.businesses
      .slice(i, i + 2)
      .map((b) => ({ text: `${b.icon} ${b.label}`, callback_data: `niche:${productId}:${b.slug}` }));
    rows.push(row);
  }
  rows.push([{ text: "⬅️ Назад к списку", callback_data: "menu" }]);

  return { text, keyboard: rows };
}

export function findNiche(productId: string, businessSlug: string) {
  const product = products.find((p) => p.id === productId);
  const business = product?.businesses.find((b) => b.slug === businessSlug);
  if (!product || !business) return null;
  return { product, business };
}

/** Персонализированный питч под конкретную нишу — использует тот же тон, что и демо на сайте. */
export function buildNichePitch(productId: string, businessSlug: string): { text: string; keyboard: InlineKeyboard } | null {
  const found = findNiche(productId, businessSlug);
  if (!found) return null;
  const { product, business } = found;

  const text =
    `${business.icon} <b>${business.label}</b>\n\n` +
    `${product.demoGreeting(business.label)}\n\n` +
    `${product.description}\n\n` +
    `📈 Пример: «${product.beforeAfter.before}» → «${product.beforeAfter.after}»\n\n` +
    `Расскажите в паре слов, что хотите автоматизировать, и телефон/WhatsApp — я сразу передам менеджеру.`;

  const keyboard: InlineKeyboard = [
    [{ text: "⬅️ Другая сфера", callback_data: `product:${product.id}` }],
    [{ text: "⬅️ Все категории", callback_data: "menu" }],
  ];

  return { text, keyboard };
}

/** Продукт-пикер для режима "подсказчик" (/suggest) — отдельные callback_data
 * от обычного product:/niche:, чтобы не путать с веткой для клиентов бота. */
export function buildSuggestProductKeyboard(): InlineKeyboard {
  const rows: InlineKeyboard = [];
  for (let i = 0; i < products.length; i += 2) {
    const row = products
      .slice(i, i + 2)
      .map((p) => ({ text: `${p.icon} ${p.menuLabel}`, callback_data: `sproduct:${p.id}` }));
    rows.push(row);
  }
  return rows;
}

export function buildSuggestNichePicker(productId: string): { text: string; keyboard: InlineKeyboard } | null {
  const product = products.find((p) => p.id === productId);
  if (!product) return null;

  const text = `${product.icon} <b>${product.title}</b>\n\nС какой сферой сейчас общаетесь?`;

  const rows: InlineKeyboard = [];
  for (let i = 0; i < product.businesses.length; i += 2) {
    const row = product.businesses
      .slice(i, i + 2)
      .map((b) => ({ text: `${b.icon} ${b.label}`, callback_data: `sniche:${productId}:${b.slug}` }));
    rows.push(row);
  }
  rows.push([{ text: "⬅️ Назад", callback_data: "smenu" }]);

  return { text, keyboard: rows };
}

const SITE_DEMO_LINK = `${SITE_URL}/#products`;

/** Готовый текст первого сообщения новому контакту под конкретную нишу —
 * для режима "подсказчик" (/suggest), чтобы не сочинять с нуля каждый раз.
 * Отправлять с { html: true } — в тексте есть HTML-ссылка на бренд. */
export function buildOpeningMessage(productId: string, businessSlug: string): string | null {
  const found = findNiche(productId, businessSlug);
  if (!found) return null;
  const { product, business } = found;

  return (
    `Здравствуйте! Пишу вам от ${BRAND_LINK}. Мы делаем ${product.objectName} для сферы «${business.label.toLowerCase()}»: ` +
    `${product.description} Можно за 2 минуты показать, как это работает для вашей сферы — вот живое демо: ${SITE_DEMO_LINK}`
  );
}

type FaqRule = { keywords: string[]; answer: string };

export const FAQ_RULES: FaqRule[] = [
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
    answer:
      "Мы мониторим работу автоматизации и оперативно чиним сбои — это входит в сопровождение, отдельно платить не нужно.",
  },
  {
    keywords: ["настраива", "сам", "что от меня", "нужно ли мне"],
    answer:
      "Всю техническую настройку берём на себя. От вас — доступ к нужным каналам (например, WhatsApp Business) и 15 минут на созвон.",
  },
];

export function matchFaq(text: string): string | null {
  const normalized = text.toLowerCase();
  for (const rule of FAQ_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.answer;
    }
  }
  return null;
}

export const FAQ_PROMPT_KEYBOARD: InlineKeyboard = [
  [{ text: "⬅️ Назад к списку продуктов", callback_data: "menu" }],
];

export const FAQ_PROMPT_TEXT =
  "Спросите про цену, сроки внедрения или поддержку — отвечу сразу. Либо напишите в паре слов, чем занимается ваш бизнес, и я подскажу подходящий вариант.";

/**
 * Анализирует, что написал клиент, и подбирает готовый ответ: сначала по
 * общим вопросам про наш продукт (цена, сроки, поддержка — FAQ_RULES),
 * затем — если известен продукт/ниша — по демо-сценарию этого продукта
 * (как ИИ-администратор отвечал бы клиентам этого бизнеса, product.demoRules).
 * Используется в режиме "подсказчик" (/suggest) — предлагает текст, который
 * вы сами копируете и отправляете живому клиенту, ничего не отправляет само.
 */
export function buildReplySuggestion(clientText: string, context: { productId?: string }): string {
  const faqAnswer = matchFaq(clientText);
  if (faqAnswer) return faqAnswer;

  if (context.productId) {
    const product = products.find((p) => p.id === context.productId);
    if (product) {
      const normalized = clientText.toLowerCase();
      for (const rule of product.demoRules) {
        if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
          return rule.answer;
        }
      }
    }
  }

  return "Готового шаблона под это сообщение нет — здесь лучше ответить самостоятельно, своими словами, с учётом контекста разговора.";
}

export type ReplySuggestion = { title: string; text: string; source: string };

/**
 * Живой поиск подсказок по мере ввода — для инлайн-режима бота (@бот текст
 * прямо в поле ввода любого чата, включая переписку с клиентом). Ищет и по
 * общим вопросам про наш продукт (FAQ_RULES), и по сценариям всех 5 продуктов
 * (demoRules) сразу — на этом этапе неизвестно, с каким именно бизнесом
 * говорит владелец, поэтому не сужаем до одной ниши, как в /suggest.
 */
export function searchReplySuggestions(query: string, limit = 15): ReplySuggestion[] {
  const normalized = query.trim().toLowerCase();
  const results: ReplySuggestion[] = [];

  const keywordMatches = (keywords: string[]) =>
    normalized !== "" && keywords.some((k) => k.includes(normalized) || normalized.includes(k));

  for (const rule of FAQ_RULES) {
    if (normalized === "" || keywordMatches(rule.keywords)) {
      results.push({ title: rule.keywords[0], text: rule.answer, source: "Про наш продукт" });
    }
  }

  for (const product of products) {
    for (const rule of product.demoRules) {
      if (keywordMatches(rule.keywords)) {
        results.push({ title: `${rule.keywords[0]} (${product.menuLabel})`, text: rule.answer, source: product.menuLabel });
      }
    }
  }

  const priceKeywords = ["цена", "цену", "стоимост", "прайс", "почем", "сколько сто"];
  for (const product of products) {
    const range = PRICING[product.id];
    if (!range) continue;
    const matchesPrice =
      normalized === "" ||
      keywordMatches(priceKeywords) ||
      normalized.includes(product.menuLabel.toLowerCase()) ||
      product.menuLabel.toLowerCase().includes(normalized);
    if (matchesPrice) {
      results.push({
        title: `${product.icon} Цена: ${product.menuLabel}`,
        text: `${product.icon} ${product.menuLabel} — ${formatPriceRange(range)}`,
        source: "Цены",
      });
    }
  }

  return results.slice(0, limit);
}

export const GENERIC_ACK =
  "Записал ваше сообщение и уже передал менеджеру — он ответит вам здесь в течение рабочего дня. Если хотите ускориться, оставьте номер WhatsApp — свяжемся быстрее.";

type GroupListenerStatus = {
  autoDiscover?: boolean;
  watchMode?: string;
  maxJoinsPerDay?: number;
  joinedToday?: number;
  maxTotalGroups?: number;
  groupCount?: number | null;
  online?: boolean;
};

/** Статус всей системы для владельца — команда /status в личке с ботом. */
export async function buildStatusText(): Promise<string> {
  if (!sql) return "База данных не настроена — статус недоступен.";

  const [heartbeatRows, leadsTotal, leadsToday, businessesTotal, businessesQualified, groupLeadsTotal, groupLeadsToday] =
    await Promise.all([
      sql`SELECT value, updated_at FROM system_status WHERE key = 'group_listener'`,
      sql`SELECT count(*) FROM leads`,
      sql`SELECT count(*) FROM leads WHERE created_at >= date_trunc('day', now())`,
      sql`SELECT count(*) FROM businesses`,
      sql`SELECT count(*) FROM businesses WHERE qualified = true`,
      sql`SELECT count(*) FROM group_leads`,
      sql`SELECT count(*) FROM group_leads WHERE created_at >= date_trunc('day', now())`,
    ]);

  const heartbeat = heartbeatRows[0];
  let listenerBlock: string;

  if (!heartbeat) {
    listenerBlock = "🔴 Ещё ни разу не запускался (npm run group-listener)";
  } else {
    const value = heartbeat.value as GroupListenerStatus;
    const ageMin = Math.round((Date.now() - new Date(heartbeat.updated_at).getTime()) / 60000);
    const isOnline = value.online !== false && ageMin < 15;
    const lines = [
      `${isOnline ? "🟢 работает" : "🔴 не отвечает"} (обновлено ${ageMin < 1 ? "только что" : `${ageMin} мин назад`})`,
    ];
    if (value.watchMode) {
      lines.push(`Режим: ${value.watchMode === "all" ? "все группы" : value.watchMode}`);
    }
    if (typeof value.groupCount === "number") {
      lines.push(`Состоит в группах: ${value.groupCount}${value.maxTotalGroups ? ` (лимит ${value.maxTotalGroups})` : ""}`);
    }
    lines.push(
      value.autoDiscover
        ? `Автопоиск новых групп: включён, сегодня ${value.joinedToday ?? 0}/${value.maxJoinsPerDay ?? "?"}`
        : "Автопоиск новых групп: выключен",
    );
    listenerBlock = lines.join("\n");
  }

  return [
    "📊 <b>Статус системы</b>",
    "",
    "🖥 <b>Мониторинг Telegram-групп</b> (личный аккаунт)",
    listenerBlock,
    "",
    "📥 <b>Заявки</b> (сайт + бот)",
    `Всего: ${leadsTotal[0].count} · сегодня: ${leadsToday[0].count}`,
    "",
    "🏢 <b>Бизнесы из 2GIS</b>",
    `Всего: ${businessesTotal[0].count} · прошли порог: ${businessesQualified[0].count}`,
    "",
    "👀 <b>Заказы, найденные в группах</b>",
    `Всего: ${groupLeadsTotal[0].count} · сегодня: ${groupLeadsToday[0].count}`,
    "",
    "💬 <b>WhatsApp</b>",
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
      ? "🟢 подключён (Cloud API)"
      : "🔴 не подключён — см. docs/WHATSAPP_SETUP.md",
    "",
    "Команды: /leads — новые заявки, /found — найденные бизнесы, /groups — заказы из групп, /help — все команды.",
  ].join("\n");
}

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "Новая",
  contacted: "Написали",
  won: "Договорились",
  lost: "Отказ",
};

export type LeadListItem = { id: number; text: string; keyboard: InlineKeyboard };

/** Последние заявки со статусом "новая" — по одному сообщению на заявку, с кнопками смены статуса (команда /leads). */
export async function buildLeadsList(limit = 5): Promise<{ items: LeadListItem[]; totalNew: number } | null> {
  if (!sql) return null;

  const rows = (await sql`
    SELECT id, name, contact, niche, comment, source, created_at FROM leads
    WHERE status = 'new' ORDER BY created_at DESC LIMIT ${limit}
  `) as { id: number; name: string; contact: string; niche: string | null; comment: string | null; source: string; created_at: string }[];
  const [{ count }] = await sql`SELECT count(*) FROM leads WHERE status = 'new'`;

  const items: LeadListItem[] = rows.map((r) => ({
    id: r.id,
    text: [
      `🆕 <b>${escapeHtml(r.name)}</b> (${r.source === "telegram" ? "Telegram" : "Сайт"})`,
      `Контакт: ${escapeHtml(r.contact)}`,
      `Ниша: ${escapeHtml(r.niche || "—")}`,
      r.comment ? `Комментарий: ${escapeHtml(r.comment)}` : null,
      new Date(r.created_at).toLocaleString("ru-RU"),
    ]
      .filter(Boolean)
      .join("\n"),
    keyboard: [
      [
        { text: "✅ Написал(а)", callback_data: `lead:${r.id}:contacted` },
        { text: "🤝 Сделка", callback_data: `lead:${r.id}:won` },
        { text: "❌ Отказ", callback_data: `lead:${r.id}:lost` },
      ],
    ],
  }));

  return { items, totalNew: Number(count) };
}

/** Топ найденных через автопоиск 2GIS бизнесов по баллу — команда /found. */
export async function buildFoundBusinessesText(limit = 5): Promise<string> {
  if (!sql) return "База данных не настроена.";

  const rows = (await sql`
    SELECT name, industry, city, card_url, score, pitch FROM businesses
    ORDER BY score DESC, created_at DESC LIMIT ${limit}
  `) as { name: string; industry: string; city: string; card_url: string; score: number; pitch: string }[];
  const [{ count }] = await sql`SELECT count(*) FROM businesses`;

  if (rows.length === 0) {
    return "Пока пусто — автопоиск запускается по понедельникам, либо весь список уже разобран.";
  }

  const blocks = rows.map(
    (r) =>
      `🏢 <b>${escapeHtml(r.name)}</b> (${escapeHtml(r.industry || "?")}, ${escapeHtml(r.city || "?")}) — балл ${r.score}\n` +
      (r.card_url ? `Карточка: ${r.card_url}\n` : "") +
      `Черновик:\n${escapeHtml(r.pitch)}`,
  );

  return (
    `🏢 <b>Найденные бизнесы (всего ${count}, топ ${rows.length})</b>\n\n` +
    blocks.join("\n\n") +
    "\n\nПолный список и остальные — в /admin."
  );
}

/** Последние заказы, замеченные в Telegram-группах — команда /groups. */
export async function buildGroupLeadsText(limit = 5): Promise<string> {
  if (!sql) return "База данных не настроена.";

  const rows = (await sql`
    SELECT chat_title, business_label, sender_name, sender_username, message_text, pitch, created_at
    FROM group_leads ORDER BY created_at DESC LIMIT ${limit}
  `) as {
    chat_title: string | null;
    business_label: string | null;
    sender_name: string | null;
    sender_username: string | null;
    message_text: string | null;
    pitch: string;
    created_at: string;
  }[];
  const [{ count }] = await sql`SELECT count(*) FROM group_leads`;

  if (rows.length === 0) {
    return "Пока пусто — ни бот, ни личный аккаунт ещё не заметили подходящих постов в группах.";
  }

  const blocks = rows.map(
    (r) =>
      `👀 <b>${escapeHtml(r.chat_title || "Группа")}</b> — ${escapeHtml(r.business_label || "?")}\n` +
      `Автор: ${escapeHtml(r.sender_name || "?")} ${r.sender_username ? escapeHtml(r.sender_username) : ""}\n` +
      `Сообщение: ${escapeHtml(r.message_text || "")}\n` +
      `${new Date(r.created_at).toLocaleString("ru-RU")}\n` +
      `Черновик:\n${escapeHtml(r.pitch)}`,
  );

  return (
    `👀 <b>Заказы из групп (всего ${count}, последние ${rows.length})</b>\n\n` +
    blocks.join("\n\n") +
    "\n\nПолный список — в /admin."
  );
}

/** Полная вилка цен по всем продуктам — команда /price. Черновая, для внутреннего использования (см. lib/pricing.ts). */
export function buildPriceText(): string {
  const lines = products
    .map((product) => {
      const range = PRICING[product.id];
      if (!range) return null;
      return `${product.icon} <b>${product.menuLabel}</b>\n${formatPriceRange(range)}`;
    })
    .filter(Boolean);

  return (
    "💰 <b>Цены (черновик, не для сайта)</b>\n\n" +
    lines.join("\n\n") +
    "\n\nНижняя граница — простая интеграция, верхняя — несколько каналов/кастомная CRM.\n" +
    "Быстрый доступ в любом чате: наберите <code>@BusinessAI_auto_bot цена</code> — появится готовая строка под конкретный продукт, останется скопировать."
  );
}

export const HELP_TEXT =
  "<b>Команды</b>\n\n" +
  "/status — сводка по всей системе\n" +
  "/leads — новые заявки с кнопками смены статуса\n" +
  "/found — топ бизнесов, найденных автопоиском\n" +
  "/groups — заказы, замеченные в Telegram-группах\n" +
  "/price — вилка цен по всем продуктам\n" +
  "/suggest — подсказчик готовых ответов, когда сами пишете клиенту\n" +
  "/suggest_off — выключить подсказчик\n\n" +
  "<b>Без слэша, по-русски</b> (проще набирать, работает так же):\n" +
  "статус · лиды/заявки · найдено/бизнесы · группы/заказы · цена/цены/стоимость · помощь/команды · подсказчик/подскажи";
