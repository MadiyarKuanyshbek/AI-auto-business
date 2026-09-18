import { sql, type SubscriptionRow } from '../lib/db';
import { notifySelf, stopBot } from './waManager';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 минут

function reminderText(daysLeft: number, sub: SubscriptionRow) {
  const until = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('ru-RU') : '';
  return (
    `⏰ Напоминание: подписка на WhatsApp-бота для «${sub.business_name}» ` +
    `заканчивается ${daysLeft === 1 ? 'завтра' : `через ${daysLeft} дня`} (${until}). ` +
    `Чтобы бот продолжил отвечать клиентам без перерыва, продлите подписку (${sub.price_kzt.toLocaleString('ru-RU')} ₸/мес).`
  );
}

async function remindTick() {
  if (!sql) return;

  const threeDayDue = (await sql`
    SELECT * FROM subscriptions
    WHERE status = 'active'
      AND current_period_end BETWEEN now() + interval '2 days 12 hours' AND now() + interval '3 days 12 hours'
      AND reminded_3d_at IS NULL
  `) as SubscriptionRow[];

  for (const sub of threeDayDue) {
    // Сокет ещё не поднят/не подключён — просто попробуем на следующем тике,
    // дедуп-колонку не трогаем, пока сообщение реально не ушло.
    const sent = await notifySelf(sub.owner_id, reminderText(3, sub));
    if (sent) {
      await sql`UPDATE subscriptions SET reminded_3d_at = now() WHERE id = ${sub.id}`;
    }
  }

  const oneDayDue = (await sql`
    SELECT * FROM subscriptions
    WHERE status = 'active'
      AND current_period_end BETWEEN now() + interval '12 hours' AND now() + interval '1 day 12 hours'
      AND reminded_1d_at IS NULL
  `) as SubscriptionRow[];

  for (const sub of oneDayDue) {
    const sent = await notifySelf(sub.owner_id, reminderText(1, sub));
    if (sent) {
      await sql`UPDATE subscriptions SET reminded_1d_at = now() WHERE id = ${sub.id}`;
    }
  }
}

async function expireTick() {
  if (!sql) return;

  const expired = (await sql`
    UPDATE subscriptions SET status = 'expired', updated_at = now()
    WHERE status = 'active' AND current_period_end < now()
    RETURNING owner_id
  `) as { owner_id: string }[];

  for (const row of expired) {
    console.log(`[scheduler] subscription expired for owner ${row.owner_id}, stopping bot`);
    stopBot(row.owner_id);
  }
}

export function startSubscriptionScheduler() {
  const intervalMs = Number(process.env.SUBSCRIPTION_SCHEDULER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);

  const tick = () => {
    remindTick().catch((err) => console.error('[scheduler] remindTick failed:', err));
    expireTick().catch((err) => console.error('[scheduler] expireTick failed:', err));
  };

  tick();
  return setInterval(tick, intervalMs);
}
