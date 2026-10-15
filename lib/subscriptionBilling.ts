import { sql, type SubscriptionRow } from "@/lib/db";
import { sendTelegramMessageAs, notifyOwner, escapeHtml } from "@/lib/telegram";
import { SITE_URL } from "@/lib/siteUrl";

export const TRIAL_DAYS = 7;

export function payUrl(subscriptionId: number) {
  return `${SITE_URL}/subscriptions/${subscriptionId}/pay`;
}

/** Дата для людей: "12 нояб." — без года, ближайшие даты. */
export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Almaty" });
}

/**
 * Продлевает подписку на periodMonths месяцев ОТ КОНЦА текущего периода (если он
 * ещё не истёк) — чтобы оплата за 6 дней до конца не "сгорала". Для Telegram
 * подписок это и есть вся "активация": вебхук уже зарегистрирован при
 * регистрации, платёж лишь продлевает право на ответы бота.
 */
export async function extendSubscription(subscriptionId: number, periodMonths: number) {
  if (!sql) return null;
  const [row] = (await sql`
    UPDATE subscriptions
    SET status = 'active',
        paid_at = COALESCE(paid_at, now()),
        current_period_end = GREATEST(now(), COALESCE(current_period_end, now())) + make_interval(months => ${periodMonths}),
        reminded_3d_at = NULL,
        reminded_1d_at = NULL,
        updated_at = now()
    WHERE id = ${subscriptionId}
    RETURNING *
  `) as SubscriptionRow[];
  await sql`
    UPDATE subscription_payments SET status = 'confirmed', confirmed_at = now()
    WHERE subscription_id = ${subscriptionId} AND status = 'claimed'
  `;
  return row ?? null;
}

/** Пишет владельцу бизнеса в личку через его же бота (если он привязал аккаунт), иначе вернёт false. */
export async function messageClientOwner(sub: SubscriptionRow, text: string) {
  if (sub.channel !== "telegram" || !sub.telegram_bot_token || sub.telegram_owner_chat_id === null) return false;
  const result = await sendTelegramMessageAs(sub.telegram_bot_token, sub.telegram_owner_chat_id, text);
  return result.ok;
}

/** Нам: ссылка, по которой можно сразу написать клиенту в WhatsApp, если в бота он не заходил. */
export function clientContactLine(sub: SubscriptionRow) {
  return `${escapeHtml(sub.contact_name)} · <a href="https://wa.me/${sub.contact_phone}">WhatsApp ${escapeHtml(sub.contact_phone)}</a>`;
}

export async function notifyAgencyAboutClient(sub: SubscriptionRow, title: string) {
  await notifyOwner(`${title}\n${escapeHtml(sub.business_name)}\n${clientContactLine(sub)}`, { html: true });
}
