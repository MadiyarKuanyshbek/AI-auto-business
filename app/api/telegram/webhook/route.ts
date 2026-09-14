import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { answerCallbackQuery, answerInlineQuery, escapeHtml, notifyOwner, sendTelegramMessage } from "@/lib/telegram";
import {
  buildFoundBusinessesText,
  buildGroupLeadsText,
  buildLeadsList,
  buildMenuKeyboard,
  buildMenuPromptText,
  buildNichePicker,
  buildNichePitch,
  buildOpeningMessage,
  buildPriceText,
  buildReplySuggestion,
  buildStatusText,
  buildSuggestNichePicker,
  buildSuggestProductKeyboard,
  buildWelcomeText,
  FAQ_PROMPT_KEYBOARD,
  FAQ_PROMPT_TEXT,
  findNiche,
  GENERIC_ACK,
  HELP_TEXT,
  LEAD_STATUS_LABELS,
  matchFaq,
  searchReplySuggestions,
} from "@/lib/telegramBot";
import { buildGroupPitch, detectGroupRequest } from "@/lib/groupWatcher";

type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number; type: string; title?: string };
    from?: { id: number; first_name?: string; username?: string; is_bot?: boolean };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
    from?: { id: number; first_name?: string; username?: string };
  };
  inline_query?: {
    id: string;
    from: { id: number };
    query: string;
  };
};

async function getOrCreateSession(chatId: number) {
  if (!sql) return null;

  await sql`
    INSERT INTO telegram_sessions (chat_id)
    VALUES (${chatId})
    ON CONFLICT (chat_id) DO NOTHING
  `;

  const rows = await sql`SELECT * FROM telegram_sessions WHERE chat_id = ${chatId}`;
  return rows[0] ?? null;
}

type CopilotState = { active: boolean; productId?: string; businessLabel?: string };

// Состояние режима "подсказчик" (/suggest) — какой продукт/сфера сейчас
// обсуждается с живым клиентом, чтобы подбирать релевантные ответы.
// Общая таблица system_status, отдельный ключ на каждый chat_id.
async function getCopilotState(chatId: number): Promise<CopilotState | null> {
  if (!sql) return null;
  const rows = await sql`SELECT value FROM system_status WHERE key = ${`copilot:${chatId}`}`;
  return (rows[0]?.value as CopilotState) ?? null;
}

async function setCopilotState(chatId: number, value: CopilotState) {
  if (!sql) return;
  const key = `copilot:${chatId}`;
  const json = JSON.stringify(value);
  await sql`
    INSERT INTO system_status (key, value, updated_at)
    VALUES (${key}, ${json}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = ${json}::jsonb, updated_at = now()
  `;
}

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!botToken || !ownerChatId) {
    return NextResponse.json({ error: "bot_not_configured" }, { status: 500 });
  }

  if (webhookSecret) {
    const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (headerSecret !== webhookSecret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const callback = update.callback_query;
  if (callback?.data && callback.message?.chat?.id) {
    await handleCallback(callback.id, callback.data, callback.message.chat.id);
    return NextResponse.json({ ok: true });
  }

  // Инлайн-режим: "@бот текст" прямо в поле ввода любого чата — живые
  // подсказки по мере набора, без переключения в чат с ботом. Только для
  // владельца: это внутренний инструмент, не для клиентов бота.
  const inlineQuery = update.inline_query;
  if (inlineQuery) {
    if (String(inlineQuery.from.id) !== ownerChatId) {
      await answerInlineQuery(inlineQuery.id, []);
      return NextResponse.json({ ok: true });
    }

    const suggestions = searchReplySuggestions(inlineQuery.query);
    const results = suggestions.map((s, i) => ({
      type: "article" as const,
      id: String(i),
      title: s.title,
      description: s.text,
      input_message_content: { message_text: s.text },
    }));
    await answerInlineQuery(inlineQuery.id, results);
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text || !message.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  let text = message.text.trim();

  // Групповые чаты обрабатываем отдельно от личных сообщений — бот тут
  // только слушает и помечает похожие на заказ посты, сам не отвечает и не
  // пишет автору (см. lib/groupWatcher.ts, почему полная автоматизация тут не делается).
  if (message.chat.type === "group" || message.chat.type === "supergroup") {
    if (!message.from?.is_bot) {
      await handleGroupMessage(message.chat, message.message_id, text, message.from);
    }
    return NextResponse.json({ ok: true });
  }

  const isOwner = String(chatId) === ownerChatId;
  // Нужно знать заранее, активен ли подсказчик: если да, любой текст — это
  // пересланное сообщение клиента для анализа, а не команда. Иначе слово
  // вроде "цена"/"статус" внутри реплики клиента перехватилось бы как
  // команда вместо того, чтобы попасть в подсказчик.
  const copilotState = isOwner ? await getCopilotState(chatId) : null;
  const copilotActive = Boolean(copilotState?.active);

  // Русские слова-алиасы для команд-«панели управления» — Telegram не
  // разрешает кириллицу в самих /command (только [a-z0-9_]), а переключать
  // раскладку ради команды неудобно. Слово без "/" работает так же, если
  // пишет владелец и подсказчик сейчас не активен. Подсказки и
  // автодополнение остаются на /commands — это просто более быстрый способ
  // набрать то же самое.
  if (isOwner && !copilotActive) {
    const RU_COMMAND_ALIASES: Record<string, string> = {
      статус: "/status",
      лиды: "/leads",
      заявки: "/leads",
      найдено: "/found",
      бизнесы: "/found",
      группы: "/groups",
      заказы: "/groups",
      цена: "/price",
      цены: "/price",
      стоимость: "/price",
      помощь: "/help",
      команды: "/help",
      подсказчик: "/suggest",
      подскажи: "/suggest",
    };
    const alias = RU_COMMAND_ALIASES[text.toLowerCase()];
    if (alias) text = alias;
  }

  // Telegram sends "/start <payload>" for deep links like t.me/bot?start=site,
  // not a bare "/start" — match the prefix, not the exact command.
  if (text === "/start" || text.startsWith("/start ")) {
    await sendTelegramMessage(chatId, buildWelcomeText(message.from?.first_name), {
      html: true,
      keyboard: buildMenuKeyboard(),
    });
    return NextResponse.json({ ok: true });
  }

  // Команды-«панель управления» — только владелец, чтобы через бота видеть
  // заявки/находки/заказы из групп без захода на сайт в /admin.
  if (text === "/status") {
    if (isOwner) {
      await sendTelegramMessage(chatId, await buildStatusText(), { html: true });
    }
    return NextResponse.json({ ok: true });
  }

  if (text === "/leads") {
    if (isOwner) {
      const result = await buildLeadsList();
      if (!result || result.items.length === 0) {
        await sendTelegramMessage(chatId, "Новых заявок нет 🎉");
      } else {
        for (const item of result.items) {
          await sendTelegramMessage(chatId, item.text, { html: true, keyboard: item.keyboard });
        }
        if (result.totalNew > result.items.length) {
          await sendTelegramMessage(chatId, `И ещё ${result.totalNew - result.items.length} — полный список в /admin.`);
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (text === "/found") {
    if (isOwner) {
      await sendTelegramMessage(chatId, await buildFoundBusinessesText(), { html: true });
    }
    return NextResponse.json({ ok: true });
  }

  if (text === "/groups") {
    if (isOwner) {
      await sendTelegramMessage(chatId, await buildGroupLeadsText(), { html: true });
    }
    return NextResponse.json({ ok: true });
  }

  if (text === "/price") {
    if (isOwner) {
      await sendTelegramMessage(chatId, buildPriceText(), { html: true });
    }
    return NextResponse.json({ ok: true });
  }

  if (text === "/help") {
    if (isOwner) {
      await sendTelegramMessage(chatId, HELP_TEXT, { html: true });
    }
    return NextResponse.json({ ok: true });
  }

  // Режим "подсказчик": выбираете продукт/сферу один раз, дальше пересылаете
  // сюда, что пишет живой клиент — бот анализирует и предлагает готовый
  // ответ. Сам клиенту ничего не отправляет — только вам, для копирования.
  if (text === "/suggest") {
    if (isOwner) {
      await sendTelegramMessage(chatId, "С каким продуктом сейчас общаетесь?", {
        keyboard: buildSuggestProductKeyboard(),
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (text === "/suggest_off") {
    if (isOwner) {
      await setCopilotState(chatId, { active: false });
      await sendTelegramMessage(chatId, "Режим подсказчика выключен.");
    }
    return NextResponse.json({ ok: true });
  }

  if (isOwner) {
    if (copilotState?.active) {
      const suggestion = buildReplySuggestion(text, { productId: copilotState.productId });
      await sendTelegramMessage(
        chatId,
        `💡 Предложенный ответ (скопируйте и отправьте клиенту):\n\n${suggestion}\n\n/suggest_off — выключить подсказчик`,
      );
    }
    // Ваши собственные сообщения боту вне /suggest и нераспознанных команд —
    // не лид и не клиент, поэтому дальше их обрабатывать (сохранять,
    // пересылать себе же уведомлением, авто-отвечать FAQ) не нужно.
    return NextResponse.json({ ok: true });
  }

  const from = message.from;
  const contact = from?.username ? `@${from.username}` : `Telegram chat_id ${chatId}`;
  const displayName = from?.first_name || "Без имени";

  const session = await getOrCreateSession(chatId);
  const nicheLabel = session?.niche_label ?? null;

  const forwarded = [
    "Новое сообщение из Telegram-бота",
    `От: ${displayName} ${from?.username ? `(@${from.username})` : ""} (chat_id: ${chatId})`,
    nicheLabel ? `Сфера: ${nicheLabel}` : null,
    `Сообщение: ${text}`,
  ]
    .filter(Boolean)
    .join("\n");

  const faqAnswer = matchFaq(text);

  const tasks: Promise<unknown>[] = [
    notifyOwner(forwarded),
    sendTelegramMessage(chatId, faqAnswer ?? GENERIC_ACK, {
      keyboard: faqAnswer ? FAQ_PROMPT_KEYBOARD : undefined,
    }),
  ];

  // Первое содержательное сообщение в переписке (после выбора ниши или без
  // неё) сохраняем как лид — чтобы оно было видно в /admin рядом с заявками
  // с сайта. Дальше в этой же переписке повторно не сохраняем.
  if (sql && session && !session.lead_saved) {
    tasks.push(
      sql`
        INSERT INTO leads (name, contact, niche, comment, source)
        VALUES (${displayName}, ${contact}, ${nicheLabel ?? "Telegram (без ниши)"}, ${text}, 'telegram')
      `,
    );
    tasks.push(sql`UPDATE telegram_sessions SET lead_saved = true WHERE chat_id = ${chatId}`);
  }

  await Promise.all(tasks);

  return NextResponse.json({ ok: true });
}

async function handleGroupMessage(
  chat: { id: number; type: string; title?: string },
  messageId: number,
  text: string,
  from?: { id: number; first_name?: string; username?: string },
) {
  const match = detectGroupRequest(text);
  if (!match) return;

  const authorName = from?.first_name;
  const pitch = buildGroupPitch(match, authorName);
  const senderUsername = from?.username ? `@${from.username}` : null;

  if (sql) {
    const inserted = await sql`
      INSERT INTO group_leads (chat_id, chat_title, message_id, niche, business_label, message_text, sender_username, sender_name, pitch)
      VALUES (${chat.id}, ${chat.title ?? null}, ${messageId}, ${match.business.slug}, ${match.business.label}, ${text}, ${senderUsername}, ${authorName ?? null}, ${pitch})
      ON CONFLICT (chat_id, message_id) DO NOTHING
      RETURNING id
    `;
    // Апдейт от Telegram на то же сообщение (например, edited_message) —
    // уже уведомляли, не шлём повторно.
    if (inserted.length === 0) return;
  }

  const alert = [
    "👀 Похоже на заказ в группе",
    `Группа: ${chat.title ?? chat.id}`,
    `Ниша: ${match.business.icon} ${match.business.label}`,
    `Автор: ${authorName ?? "?"} ${senderUsername ?? ""}`.trim(),
    `Сообщение: ${escapeHtml(text)}`,
    "",
    `Черновик ответа:\n${escapeHtml(pitch)}`,
  ].join("\n");

  await notifyOwner(alert, { html: true });
}

async function handleCallback(callbackId: string, data: string, chatId: number) {
  await answerCallbackQuery(callbackId);

  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  const isOwner = String(chatId) === ownerChatId;

  if (data.startsWith("lead:")) {
    if (isOwner && sql) {
      const [, idStr, status] = data.split(":");
      const leadId = Number(idStr);
      if (Number.isInteger(leadId) && status in LEAD_STATUS_LABELS && status !== "new") {
        await sql`UPDATE leads SET status = ${status} WHERE id = ${leadId}`;
        await sendTelegramMessage(chatId, `Заявка #${leadId} → ${LEAD_STATUS_LABELS[status]}`);
      }
    }
    return;
  }

  if (data === "smenu") {
    if (isOwner) {
      await sendTelegramMessage(chatId, "С каким продуктом сейчас общаетесь?", {
        keyboard: buildSuggestProductKeyboard(),
      });
    }
    return;
  }

  if (data.startsWith("sproduct:")) {
    if (isOwner) {
      const productId = data.slice("sproduct:".length);
      const picker = buildSuggestNichePicker(productId);
      if (picker) {
        await sendTelegramMessage(chatId, picker.text, { html: true, keyboard: picker.keyboard });
      }
    }
    return;
  }

  if (data.startsWith("sniche:")) {
    if (isOwner) {
      const [, productId, businessSlug] = data.split(":");
      const found = findNiche(productId, businessSlug);
      const opening = buildOpeningMessage(productId, businessSlug);
      if (found && opening) {
        await setCopilotState(chatId, { active: true, productId, businessLabel: found.business.label });
        // Отдельным сообщением — чтобы можно было скопировать целиком, без лишнего текста.
        await sendTelegramMessage(chatId, opening, { html: true });
        await sendTelegramMessage(
          chatId,
          `⬆️ Готовый текст для первого сообщения — скопируйте и отправьте новому контакту.\n\n` +
            `Подсказчик включён для «${found.business.label}». Присылайте сюда сообщения клиента — буду предлагать, что ответить.\n\n/suggest_off — выключить.`,
        );
      }
    }
    return;
  }

  if (data === "menu") {
    await sendTelegramMessage(chatId, buildMenuPromptText(), {
      html: true,
      keyboard: buildMenuKeyboard(),
    });
    return;
  }

  if (data === "faq") {
    await sendTelegramMessage(chatId, FAQ_PROMPT_TEXT, { keyboard: FAQ_PROMPT_KEYBOARD });
    return;
  }

  if (data.startsWith("niche:")) {
    const [, productId, businessSlug] = data.split(":");
    const found = findNiche(productId, businessSlug);
    const pitch = buildNichePitch(productId, businessSlug);
    if (pitch && found && sql) {
      await sql`
        INSERT INTO telegram_sessions (chat_id, niche, niche_label, lead_saved, updated_at)
        VALUES (${chatId}, ${businessSlug}, ${found.business.label}, false, now())
        ON CONFLICT (chat_id)
        DO UPDATE SET niche = ${businessSlug}, niche_label = ${found.business.label}, lead_saved = false, updated_at = now()
      `;
      await sendTelegramMessage(chatId, pitch.text, { html: true, keyboard: pitch.keyboard });
    }
    return;
  }

  if (data.startsWith("product:")) {
    const productId = data.slice("product:".length);
    const picker = buildNichePicker(productId);
    if (picker) {
      await sendTelegramMessage(chatId, picker.text, { html: true, keyboard: picker.keyboard });
    }
  }
}
