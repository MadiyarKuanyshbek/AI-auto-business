// Работа с Telegram-ботами КЛИЕНТОВ (каждый со своим токеном от @BotFather) —
// не путать с lib/telegram.ts, который в основном обслуживает собственного
// агентского бота. sendTelegramMessageAs переиспользуется оттуда же.
export { sendTelegramMessageAs } from "./telegram";

export type TelegramBotInfo = {
  id: number;
  username: string;
};

/** Проверяет, что токен рабочий, и достаёт username бота (для диплинка t.me/<username>). */
export async function getBotInfo(botToken: string): Promise<TelegramBotInfo | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.ok || !data.result?.username) return null;
    return { id: data.result.id, username: data.result.username };
  } catch (error) {
    console.error("Telegram getMe failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Список команд для нативного меню Telegram (иконка "/" у поля ввода) —
 * работает наравне с обычными словами, которые уже понимает orderBot. */
export async function registerBotCommands(botToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "menu", description: "Показать меню и цены" },
          { command: "cancel", description: "Отменить текущий заказ" },
        ],
      }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data.ok);
  } catch (error) {
    console.error("Telegram setMyCommands failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Регистрирует вебхук клиентского бота на наш URL с секретом, который
 * Telegram будет присылать обратно в заголовке X-Telegram-Bot-Api-Secret-Token
 * на каждый апдейт — так мы проверяем, что запрос реально от Telegram. */
export async function registerWebhook(botToken: string, url: string, secretToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: ["message", "callback_query"] }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data.ok);
  } catch (error) {
    console.error("Telegram setWebhook failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
