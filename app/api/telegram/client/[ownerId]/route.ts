import { NextResponse } from "next/server";
import { sql, type SubscriptionRow } from "@/lib/db";
import { sendTelegramMessageAs } from "@/lib/telegramClientBot";
import { generateAiReply } from "@/src/gemini";

const DEFAULT_SYSTEM_PROMPT =
  "Ты — AI-администратор бизнеса в Telegram. Отвечай кратко, дружелюбно и по делу.";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { id: number };
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

  const message = update.message;
  const text = message?.text;
  const chatId = message?.chat.id;
  const fromId = message?.from?.id;
  if (!text || chatId === undefined) {
    return NextResponse.json({ ok: true });
  }

  // Диплинк-привязка личного Telegram-аккаунта владельца бизнеса (для OTP
  // личного кабинета) — t.me/<bot>?start=link_<ownerId>, см. /register.
  if (text.startsWith("/start link_")) {
    await sql`UPDATE subscriptions SET telegram_owner_chat_id = ${fromId ?? chatId} WHERE id = ${sub.id}`;
    await sendTelegramMessageAs(
      sub.telegram_bot_token,
      chatId,
      "Готово! Теперь коды входа в личный кабинет будут приходить сюда.",
    );
    return NextResponse.json({ ok: true });
  }

  try {
    const reply = await generateAiReply(sub.system_prompt || DEFAULT_SYSTEM_PROMPT, text);
    await sendTelegramMessageAs(sub.telegram_bot_token, chatId, reply);
  } catch (err) {
    console.error(`[telegram client ${ownerId}] failed to reply:`, err);
  }

  return NextResponse.json({ ok: true });
}
