import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { sql, type SubscriptionRow } from "@/lib/db";
import { notifyOwner } from "@/lib/telegram";
import { registerBotCommands, registerWebhook } from "@/lib/telegramClientBot";
import { SITE_URL } from "@/lib/siteUrl";

// Раз в день (см. vercel.json; чаще нельзя — лимит крон-джобов хостинга)
// проверяет вебхук каждого активного Telegram-бота клиента через
// getWebhookInfo. Если вебхук не совпадает с ожидаемым URL, отсутствует или
// у него недавняя ошибка доставки — САМА переустанавливает его (setWebhook +
// setMyCommands) вместо того, чтобы просто пожаловаться. Владельцу агентства
// шлётся отчёт только если что-то было не так — с пометкой, исправилось само
// или нет.
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

  const reports: string[] = [];

  for (const sub of subs) {
    const token = sub.telegram_bot_token!;
    const expectedUrl = `${SITE_URL}/api/telegram/client/${sub.owner_id}`;

    let info: { url?: string; last_error_date?: number; last_error_message?: string; pending_update_count?: number } | null =
      null;
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (data.ok) info = data.result;
    } catch (err) {
      reports.push(`⚠️ ${sub.business_name}: не удалось проверить вебхук — ${err instanceof Error ? err.message : err}`);
      continue;
    }

    if (!info) {
      reports.push(`⚠️ ${sub.business_name}: getWebhookInfo не ответил`);
      continue;
    }

    const recentError = info.last_error_date && Date.now() / 1000 - info.last_error_date < 24 * 3600;
    const stuckQueue = (info.pending_update_count ?? 0) > 5;
    const wrongUrl = info.url !== expectedUrl;

    if (!recentError && !stuckQueue && !wrongUrl) continue; // всё в порядке — без отчёта

    const symptoms: string[] = [];
    if (wrongUrl) symptoms.push(`вебхук указывает не туда (${info.url || "пусто"})`);
    if (recentError) symptoms.push(`ошибка доставки: "${info.last_error_message}"`);
    if (stuckQueue) symptoms.push(`застряло ${info.pending_update_count} сообщений`);

    // Самовосстановление: переустанавливаем вебхук и команды на всякий случай —
    // не спрашиваем "почему", просто возвращаем в известное рабочее состояние.
    const secret = sub.telegram_webhook_secret ?? "";
    const reRegistered = await registerWebhook(token, expectedUrl, secret);
    if (reRegistered) await registerBotCommands(token);

    reports.push(
      `${reRegistered ? "✅ Исправлено автоматически" : "❌ Не удалось исправить"} — ${sub.business_name}: ${symptoms.join(", ")}`,
    );
  }

  if (reports.length > 0) {
    await notifyOwner(`🩺 Ежедневная проверка Telegram-ботов:\n\n${reports.join("\n")}`);
  }

  return NextResponse.json({ ok: true, checked: subs.length, reports: reports.length });
}
