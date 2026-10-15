import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { sql, type SubscriptionRow } from "@/lib/db";
import { escapeHtml, notifyOwner } from "@/lib/telegram";
import { formatDate, messageClientOwner, payUrl, clientContactLine } from "@/lib/subscriptionBilling";

// Раз в день: напоминает клиентам Telegram-подписок об окончании пробного/
// оплаченного периода (за 3 и за 1 день), а по истечении — выключает бота
// (вебхук перестаёт обслуживать покупателей клиента, см. client/[ownerId]).
// Напоминание идёт самому клиенту через его же бота, если он привязал
// аккаунт; иначе — нам в Telegram со ссылкой на WhatsApp клиента.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sql) {
    return NextResponse.json({ skipped: true, reason: "no_database" });
  }

  const agencyLines: string[] = [];
  let reminded = 0;
  let expiredCount = 0;

  const remind = async (sub: SubscriptionRow, daysLeft: number) => {
    const trial = !sub.paid_at;
    const text =
      `⏰ ${trial ? "Пробный период" : "Подписка"} бота «${sub.business_name}» заканчивается ` +
      `${formatDate(sub.current_period_end!)} (осталось ${daysLeft} дн.).\n\n` +
      `Чтобы бот не остановился, оплатите ${sub.price_kzt.toLocaleString("ru-RU")} ₸: ${payUrl(sub.id)}`;
    const delivered = await messageClientOwner(sub, text);
    if (!delivered) {
      agencyLines.push(`• ${escapeHtml(sub.business_name)} (${trial ? "триал" : "оплата"}, ещё ${daysLeft} дн.) — ${clientContactLine(sub)}`);
    }
    reminded++;
  };

  const due3 = (await sql`
    SELECT * FROM subscriptions
    WHERE channel = 'telegram' AND status = 'active' AND reminded_3d_at IS NULL
      AND current_period_end BETWEEN now() + interval '1 day' AND now() + interval '3 days'
  `) as SubscriptionRow[];
  for (const sub of due3) {
    await remind(sub, Math.max(2, Math.ceil((new Date(sub.current_period_end!).getTime() - Date.now()) / 86_400_000)));
    await sql`UPDATE subscriptions SET reminded_3d_at = now() WHERE id = ${sub.id}`;
  }

  const due1 = (await sql`
    SELECT * FROM subscriptions
    WHERE channel = 'telegram' AND status = 'active' AND reminded_1d_at IS NULL
      AND current_period_end > now() AND current_period_end < now() + interval '1 day'
  `) as SubscriptionRow[];
  for (const sub of due1) {
    await remind(sub, 1);
    await sql`UPDATE subscriptions SET reminded_1d_at = now(), reminded_3d_at = COALESCE(reminded_3d_at, now()) WHERE id = ${sub.id}`;
  }

  const expired = (await sql`
    UPDATE subscriptions SET status = 'expired', updated_at = now()
    WHERE channel = 'telegram' AND status = 'active' AND current_period_end < now()
    RETURNING *
  `) as SubscriptionRow[];
  for (const sub of expired) {
    expiredCount++;
    await messageClientOwner(
      sub,
      `⏸ Срок бота «${sub.business_name}» истёк, бот приостановлен. Оплатите ${sub.price_kzt.toLocaleString("ru-RU")} ₸, чтобы он снова заработал: ${payUrl(sub.id)}`,
    );
    agencyLines.push(`⏸ <b>Истёк срок:</b> ${escapeHtml(sub.business_name)} — ${clientContactLine(sub)}`);
  }

  if (agencyLines.length > 0) {
    await notifyOwner(["💳 <b>Подписки: нужно ваше внимание</b>", "", ...agencyLines].join("\n"), { html: true });
  }

  return NextResponse.json({ ok: true, reminded, expired: expiredCount });
}
