// Постоянный многопользовательский WhatsApp-демон для продакшена (PM2).
// При старте поднимает ботов для всех активных подписок из БД, слушает
// внутренний HTTP-мост для процесса сайта (старт/стоп/статус бота) и
// каждые 30 минут проверяет напоминания об окончании подписки и автоотключение.
//
// Запуск: node scripts/.build/wa-daemon.mjs (см. ecosystem.config.js / npm run wa-daemon)

import { sql, type SubscriptionRow } from "../lib/db";
import { startBot } from "../src/waManager";
import { startBridgeServer } from "../src/waBridgeServer";
import { startSubscriptionScheduler } from "../src/subscriptionScheduler";

async function startActiveSubscriptions() {
  if (!sql) {
    console.warn("DATABASE_URL не задан — демон стартует без активных подписок из БД.");
    return;
  }

  const active = (await sql`SELECT * FROM subscriptions WHERE status = 'active'`) as SubscriptionRow[];
  console.log(`Найдено активных подписок: ${active.length}`);

  for (const sub of active) {
    try {
      // Телефон не передаём — сессия уже привязана, повторный pairing не нужен.
      await startBot(sub.owner_id);
      console.log(`[owner ${sub.owner_id}] запущен (${sub.business_name})`);
    } catch (err) {
      console.error(`[owner ${sub.owner_id}] не удалось запустить бота при старте демона:`, err);
    }
  }
}

async function main() {
  await startActiveSubscriptions();
  startBridgeServer();
  startSubscriptionScheduler();
  console.log("WhatsApp-демон запущен.");
}

main().catch((err) => {
  console.error("Не удалось запустить WhatsApp-демон:", err);
  process.exit(1);
});
