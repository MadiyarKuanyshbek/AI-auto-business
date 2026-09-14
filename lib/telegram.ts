export type InlineKeyboard = Array<Array<{ text: string; callback_data: string }>>;

/**
 * Никогда не бросает исключение — доставка уведомления в Telegram не должна
 * ронять весь запрос (например, обработку вебхука или сохранение заявки на
 * сайте), если у получателя временный сбой, он заблокировал бота и т.п.
 * Ошибка логируется и возвращается в результате, а не пробрасывается выше.
 */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: { html?: boolean; keyboard?: InlineKeyboard },
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { skipped: true, ok: false as const };

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.html ? "HTML" : undefined,
        disable_web_page_preview: options?.html ? true : undefined,
        reply_markup: options?.keyboard ? { inline_keyboard: options.keyboard } : undefined,
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
