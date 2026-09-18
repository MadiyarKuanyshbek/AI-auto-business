import { NextResponse } from "next/server";
import { sql, type SubscriptionRow } from "@/lib/db";

// Публичная ручка (без авторизации) — отдаёт только статус, код привязки и
// дату окончания. Никаких контактов/телефонов клиента здесь не возвращаем.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sql) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const { id } = await params;
  const subId = Number(id);
  if (!Number.isInteger(subId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const [sub] = (await sql`
    SELECT status, pairing_code, current_period_end, channel, owner_id, telegram_bot_username, telegram_owner_chat_id
    FROM subscriptions WHERE id = ${subId}
  `) as Pick<
    SubscriptionRow,
    "status" | "pairing_code" | "current_period_end" | "channel" | "owner_id" | "telegram_bot_username" | "telegram_owner_chat_id"
  >[];

  if (!sub) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    status: sub.status,
    pairingCode: sub.pairing_code,
    currentPeriodEnd: sub.current_period_end,
    channel: sub.channel,
    telegramBotUsername: sub.telegram_bot_username,
    telegramLinked: sub.telegram_owner_chat_id !== null,
    telegramDeepLink: sub.telegram_bot_username
      ? `https://t.me/${sub.telegram_bot_username}?start=link_${sub.owner_id}`
      : null,
  });
}
