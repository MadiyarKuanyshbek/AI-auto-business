import { NextResponse } from "next/server";
import { payUrl } from "@/lib/subscriptionBilling";
import { sql, type SubscriptionRow } from "@/lib/db";
import { sendTelegramMessageAs, answerCallbackQueryAs } from "@/lib/telegram";
import { generateAiReply } from "@/src/gemini";
import { processOrderMessage, handleOwnerCallback, logConfusion } from "@/lib/orderBot";

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
    voice?: unknown;
    video_note?: unknown;
    video?: unknown;
    sticker?: unknown;
    animation?: unknown;
    location?: unknown;
    contact?: unknown;
    poll?: unknown;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
  };
};

// Голос/стикер/видео/геолокация и т.п. — форматы, которые бот не разбирает.
// Раньше на них не отвечали вообще: тишина выглядит так, будто бот сломался,
// хотя на самом деле он просто не умеет читать этот тип сообщения.
function unsupportedKind(message: TelegramUpdate["message"]): string | null {
  if (!message) return null;
  if (message.voice) return "голосовые сообщения";
  if (message.video_note) return "видеосообщения (кружки)";
  if (message.video) return "видео";
  if (message.sticker) return "стикеры";
  if (message.animation) return "гифки";
  if (message.location) return "геолокацию";
  if (message.contact) return "контакты";
  if (message.poll) return "опросы";
  return null;
}

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

  // Подписка закончилась (пробный период или оплаченный срок) — бот молчит
  // для клиентов бизнеса, а владельцу напоминает про оплату. Кнопки владельца
  // (callback) и привязка аккаунта (/start link_) при этом продолжают работать.
  if (sub.status !== "active" && !update.callback_query && !update.message?.text?.startsWith("/start link_")) {
    const chat = update.message?.chat.id;
    if (chat !== undefined) {
      const isOwnerChat = sub.telegram_owner_chat_id !== null && String(chat) === String(sub.telegram_owner_chat_id);
      await sendTelegramMessageAs(
        sub.telegram_bot_token,
        chat,
        isOwnerChat
          ? `⏸ Подписка закончилась, бот приостановлен. Оплатите, чтобы он снова отвечал клиентам: ${payUrl(sub.id)}`
          : "Извините, сейчас бот временно недоступен. Пожалуйста, свяжитесь с заведением напрямую.",
      );
    }
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
  if (chatId === undefined) {
    return NextResponse.json({ ok: true });
  }

  if (!text && !fileId) {
    const kind = unsupportedKind(message);
    if (kind) {
      await logConfusion(sub.id, chatId, "unsupported_type", kind);
      await sendTelegramMessageAs(
        sub.telegram_bot_token,
        chatId,
        `Извините, ${kind} пока не понимаю 🙏 Напишите, пожалуйста, текстом, что хотите заказать.`,
      );
    }
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
