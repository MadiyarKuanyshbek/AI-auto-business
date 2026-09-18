import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { sql, type SubscriptionRow } from "@/lib/db";
import { notifyOwner } from "@/lib/telegram";

// Раз в день (см. vercel.json) проверяет вебхук каждого активного
// Telegram-бота клиента через getWebhookInfo — если Telegram сам сообщает
// об ошибке доставки апдейтов или их накопилось много (бот не отвечает),
// шлём предупреждение владельцу агентства. Никаких сообщений клиентам.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!sql) {
    return NextResponse.json({ skipped: true, reason: "no_database" });
  }

  const subs = (await sql`
    SELECT * FROM subscriptions WHERE channel = 'telegram' AND status = 'active' AND telegram_bot_token IS NOT NULL
  `) as SubscriptionRow[];

  const problems: string[] = [];

  for (const sub of subs) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${sub.telegram_bot_token}/getWebhookInfo`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (!data.ok) {
        problems.push(`⚠️ ${sub.business_name}: getWebhookInfo вернул ошибку — ${JSON.stringify(data)}`);
        continue;
      }
      const info = data.result;
      if (info.last_error_date) {
        const errorAgo = Math.round((Date.now() / 1000 - info.last_error_date) / 3600);
        if (errorAgo < 24) {
          problems.push(
            `⚠️ ${sub.business_name}: ошибка доставки вебхука ${errorAgo} ч. назад — "${info.last_error_message}"`,
          );
        }
      }
      if (info.pending_update_count > 5) {
        problems.push(`⚠️ ${sub.business_name}: накопилось ${info.pending_update_count} необработанных сообщений`);
      }
      if (!info.url) {
        problems.push(`⚠️ ${sub.business_name}: вебхук не зарегистрирован (url пустой)`);
      }
    } catch (err) {
      problems.push(`⚠️ ${sub.business_name}: не удалось проверить вебхук — ${err instanceof Error ? err.message : err}`);
    }
  }

  if (problems.length > 0) {
    await notifyOwner(`🩺 Проверка Telegram-ботов клиентов нашла проблемы:\n\n${problems.join("\n")}`);
  }

  return NextResponse.json({ ok: true, checked: subs.length, problems: problems.length });
}
