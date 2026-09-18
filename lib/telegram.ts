export type InlineKeyboard = Array<Array<{ text: string; callback_data: string }>>;
/** Постоянная клавиатура над полем ввода (не под конкретным сообщением, как
 * InlineKeyboard) — нажатие кнопки отправляет её текст обычным сообщением,
 * так что клиент видит доступные команды и может нажать вместо печати. */
export type ReplyKeyboard = string[][];

/**
 * Никогда не бросает исключение — доставка уведомления в Telegram не должна
 * ронять весь запрос (например, обработку вебхука или сохранение заявки на
 * сайте), если у получателя временный сбой, он заблокировал бота и т.п.
 * Ошибка логируется и возвращается в результате, а не пробрасывается выше.
 *
 * Параметризована токеном — тот же вызов используется и для агентского
 * бота (sendTelegramMessage ниже, токен из env), и для ботов клиентов
 * (свой токен на каждую Telegram-подписку, см. lib/telegramClientBot.ts).
 */
export async function sendTelegramMessageAs(
  botToken: string,
  chatId: number | string,
  text: string,
  options?: { html?: boolean; keyboard?: InlineKeyboard; replyKeyboard?: ReplyKeyboard },
) {
  const replyMarkup = options?.keyboard
    ? { inline_keyboard: options.keyboard }
    : options?.replyKeyboard
      ? {
          keyboard: options.replyKeyboard.map((row) => row.map((label) => ({ text: label }))),
          resize_keyboard: true,
          is_persistent: true,
        }
      : undefined;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.html ? "HTML" : undefined,
        disable_web_page_preview: options?.html ? true : undefined,
        reply_markup: replyMarkup,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Telegram sendMessage failed (${response.status}): ${errorText}`);
      return { skipped: false, ok: false as const };
    }

    return { skipped: false, ok: true as const };
  } catch (error) {
    console.error("Telegram sendMessage request failed:", error instanceof Error ? error.message : error);
    return { skipped: false, ok: false as const };
  }
}

/**
 * Пересылает фото по file_id (без повторной загрузки — Telegram принимает
 * file_id, выданный тем же ботом, в любом чате этого бота). Используется,
 * чтобы переслать скриншот оплаты клиента владельцу бизнеса вместе с текстом заказа.
 */
export async function sendTelegramPhotoAs(
  botToken: string,
  chatId: number | string,
  fileId: string,
  caption: string,
) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: fileId, caption: caption.slice(0, 1024) }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Telegram sendPhoto failed (${response.status}): ${errorText}`);
      return { ok: false as const };
    }

    return { ok: true as const };
  } catch (error) {
    console.error("Telegram sendPhoto request failed:", error instanceof Error ? error.message : error);
    return { ok: false as const };
  }
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: { html?: boolean; keyboard?: InlineKeyboard },
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { skipped: true, ok: false as const };
  return sendTelegramMessageAs(botToken, chatId, text, options);
}

export type InlineQueryResult = {
  type: "article";
  id: string;
  title: string;
  description?: string;
  input_message_content: { message_text: string };
};

export async function answerInlineQuery(inlineQueryId: string, results: InlineQueryResult[]) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/answerInlineQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inline_query_id: inlineQueryId,
        results,
        cache_time: 0,
        is_personal: true,
      }),
    });
    if (!response.ok) {
      console.error("Telegram answerInlineQuery failed:", await response.text());
    }
  } catch (error) {
    console.error("Telegram answerInlineQuery request failed:", error instanceof Error ? error.message : error);
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (error) {
    console.error("Telegram answerCallbackQuery failed:", error instanceof Error ? error.message : error);
  }
}

export async function notifyOwner(text: string, options?: { html?: boolean }) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId) return { skipped: true };
  return sendTelegramMessage(ownerChatId, text, options);
}

export function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
