import { NextResponse } from "next/server";
import { sql, type SubscriptionRow } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { sendTelegramMessageAs } from "@/lib/telegramClientBot";

async function notifyViaBridge(ownerId: string, text: string) {
  const bridgeUrl = process.env.WA_BRIDGE_URL ?? "http://127.0.0.1:4001";
  const secret = process.env.INTERNAL_BRIDGE_SECRET;

  const response = await fetch(`${bridgeUrl}/bots/${ownerId}/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": secret ?? "" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`bridge responded ${response.status}`);
  const body = (await response.json()) as { ok: boolean };
  return body.ok;
}

/** Для Telegram-подписок демон не нужен — просто шлём сообщение напрямую
 * ботом клиента его же владельцу (chat_id привязан диплинком при подключении). */
async function notifyViaTelegram(sub: SubscriptionRow, text: string) {
  if (!sub.telegram_bot_token || !sub.telegram_owner_chat_id) return false;
  const result = await sendTelegramMessageAs(sub.telegram_bot_token, sub.telegram_owner_chat_id, text);
  return result.ok;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: Request) {
  if (!sql) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const phone =
    typeof body === "object" && body !== null && "phone" in body ? String((body as { phone: unknown }).phone) : "";
  const phoneDigits = normalizePhone(phone);

  // Не палим наличие/отсутствие подписки у номера — отвечаем ok в любом случае.
  if (!phoneDigits) {
    return NextResponse.json({ ok: true });
  }

  const [sub] = (await sql`
    SELECT * FROM subscriptions WHERE contact_phone = ${phoneDigits} ORDER BY created_at DESC LIMIT 1
  `) as SubscriptionRow[];

  if (!sub) {
    return NextResponse.json({ ok: true });
  }

  const code = generateCode();
  await sql`
    UPDATE subscriptions SET otp_code = ${code}, otp_expires_at = now() + interval '5 minutes'
    WHERE id = ${sub.id}
  `;

  const text = `Код для входа в личный кабинет: ${code}\nДействует 5 минут.`;

  if (sub.channel === "telegram") {
    if (!sub.telegram_owner_chat_id) {
      return NextResponse.json({ error: "telegram_not_linked" }, { status: 409 });
    }
    const sent = await notifyViaTelegram(sub, text);
    if (!sent) {
      return NextResponse.json({ error: "bot_offline" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  try {
    const sent = await notifyViaBridge(sub.owner_id, text);
    if (!sent) {
      return NextResponse.json({ error: "bot_offline" }, { status: 502 });
    }
  } catch (err) {
    console.error(`Failed to send portal OTP for subscription ${sub.id}:`, err);
    return NextResponse.json({ error: "daemon_unreachable" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
