import { NextResponse } from "next/server";
import { sql, type SubscriptionRow } from "@/lib/db";
import { sendTelegramMessageAs, answerCallbackQueryAs } from "@/lib/telegram";
import { generateAiReply } from "@/src/gemini";
import { processOrderMessage, handleOwnerCallback } from "@/lib/orderBot";

// generateAiReply умеет ретраить до 5 раз на 2 модели — в худшем случае это
// может растянуться дольше, чем Telegram готов ждать ответ вебхука (видели
// реальный "Read timeout expired" в getWebhookInfo). Даём функции запас по
// времени сверх дефолтных 10с на Vercel Hobby...
export const maxDuration = 30;
// ...и всё равно не ждём ИИ дольше 15с — лучше быстро ответить заглушкой,
// чем заставить Telegram решить, что бот не отвечает, и получить таймаут.
const AI_REPLY_TIMEOUT_MS = 15000;
const TIMEOUT_FALLBACK_REPLY = "Принял ваш запрос! Отвечу чуть позже.";

const DEFAULT_SYSTEM_PROMPT =
  "Ты — AI-администратор бизнеса в Telegram. Отвечай кратко, дружелюбно и по делу.";

async function generateAiReplyWithTimeout(prompt: string, text: string): Promise<string> {
  return Promise.race([
    generateAiReply(prompt, text),
    new Promise<string>((resolve) => setTimeout(() => resolve(TIMEOUT_FALLBACK_REPLY), AI_REPLY_TIMEOUT_MS)),
  ]);
}

type TelegramUpdate = {
  message?: {
    text?: string;
    caption?: string;
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    photo?: { file_id: string; width: number; height: number }[];
    document?: { file_id: string; mime_type?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
  };
};

export async function POST(request: Request, { params }: { params: Promise<{ ownerId: string }> }) {
  if (!sql) {
    return NextResponse.json({ ok: true }); // Telegram не должен получать 5xx — просто молча игнорируем
  }

  const { ownerId } = await params;
  const [sub] = (await sql`SELECT * FROM subscriptions WHERE owner_id = ${ownerId}`) as SubscriptionRow[];
  if (!sub || sub.channel !== "telegram" || !sub.telegram_bot_token) {
    return NextResponse.json({ ok: true });
  }

  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (!sub.telegram_webhook_secret || secretHeader !== sub.telegram_webhook_secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Нажатие inline-кнопки под уведомлением о заказе (например, владелец
  // отмечает "Заказ готов") — отдельный тип апдейта, не "message".
  if (update.callback_query) {
    const cb = update.callback_query;
    try {
      const resultText = await handleOwnerCallback(sub, cb.data ?? "");
      await answerCallbackQueryAs(sub.telegram_bot_token, cb.id, resultText);
    } catch (err) {
      console.error(`[telegram client ${ownerId}] callback failed:`, err);
      await answerCallbackQueryAs(sub.telegram_bot_token, cb.id, "Не получилось, попробуйте ещё раз");
    }
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chatId = message?.chat.id;
  const fromId = message?.from?.id;
  const text = message?.text ?? message?.caption;
  const photoFileId = message?.photo?.length ? message.photo[message.photo.length - 1].file_id : undefined;
  const documentFileId = message?.document?.file_id;
  const fileId = photoFileId ?? documentFileId;
  const fileKind: "photo" | "document" | undefined = photoFileId ? "photo" : documentFileId ? "document" : undefined;
  if (chatId === undefined || (!text && !fileId)) {
    return NextResponse.json({ ok: true });
  }

  // Диплинк-привязка личного Telegram-аккаунта владельца бизнеса (для OTP
  // личного кабинета) — t.me/<bot>?start=link_<ownerId>, см. /register.
  if (text?.startsWith("/start link_")) {
    await sql`UPDATE subscriptions SET telegram_owner_chat_id = ${fromId ?? chatId} WHERE id = ${sub.id}`;
    await sendTelegramMessageAs(
      sub.telegram_bot_token,
      chatId,
      "Готово! Теперь заказы и коды входа в личный кабинет будут приходить сюда.",
    );
    return NextResponse.json({ ok: true });
  }

  try {
    if (sub.menu_items && sub.menu_items.length > 0) {
      // Есть меню — ведём пошаговый сценарий заказа (считает код, а не ИИ),
      // а не просто свободный чат.
      const customerName = [message?.from?.first_name, message?.from?.username ? `@${message.from.username}` : null]
        .filter(Boolean)
        .join(" ");
      await processOrderMessage(sub, { text, fileId, fileKind, chatId, customerName: customerName || null });
    } else if (text) {
      const reply = await generateAiReplyWithTimeout(sub.system_prompt || DEFAULT_SYSTEM_PROMPT, text);
      await sendTelegramMessageAs(sub.telegram_bot_token, chatId, reply);
    }
  } catch (err) {
    console.error(`[telegram client ${ownerId}] failed to reply:`, err);
  }

  return NextResponse.json({ ok: true });
}
