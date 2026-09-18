#!/usr/bin/env node
// Создаёт/обновляет таблицы в Postgres (Neon). Безопасно запускать повторно.
// Использование: DATABASE_URL=... node scripts/init-db.mjs

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Не задан DATABASE_URL.");
    process.exit(1);
  }

  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      niche TEXT,
      comment TEXT,
      source TEXT NOT NULL DEFAULT 'site',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // На случай, если таблица leads уже существовала до появления колонки source.
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'site'`;
  // Статус ведения заявки (new/contacted/won/lost) — для воронки в админке.
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'`;
  // Когда последний раз слали напоминание про эту заявку (cron ниже) — чтобы не дублировать.
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ`;

  await sql`
    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT,
      city TEXT,
      address TEXT,
      card_url TEXT,
      whatsapp TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      qualified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Не даёт повторно завести одну и ту же карточку 2GIS при регулярных
  // запусках find-clients.mjs — пустые card_url (ручной ввод) не считаются.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS businesses_card_url_idx
    ON businesses (card_url)
    WHERE card_url <> ''
  `;
  // Готовый персональный текст обращения, собранный score-leads.mjs под
  // конкретный бизнес — чтобы его было видно и можно было скопировать в админке.
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pitch TEXT NOT NULL DEFAULT ''`;
  // Отметка "уже посмотрел это в админке" — чтобы отличать бизнесы, до
  // которых ещё не дошли руки, от уже разобранных.
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS viewed BOOLEAN NOT NULL DEFAULT false`;

  // Заявки, которые бот сам заметил в Telegram-группах (см. lib/groupWatcher.ts) —
  // сообщение + черновик ответа. Отправка — только вручную, бот сам не пишет.
  await sql`
    CREATE TABLE IF NOT EXISTS group_leads (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      chat_title TEXT,
      message_id BIGINT NOT NULL,
      niche TEXT,
      business_label TEXT,
      message_text TEXT,
      sender_username TEXT,
      sender_name TEXT,
      pitch TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Не даёт задублировать один и тот же пост, если апдейт от Telegram придёт дважды.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS group_leads_chat_message_idx
    ON group_leads (chat_id, message_id)
  `;

  // Привязывает Telegram-чат к последней выбранной нише и следит, чтобы
  // одна и та же переписка не плодила по лиду на каждое сообщение.
  await sql`
    CREATE TABLE IF NOT EXISTS telegram_sessions (
      chat_id BIGINT PRIMARY KEY,
      niche TEXT,
      niche_label TEXT,
      lead_saved BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Хартбит от долгоживущих процессов вне Vercel (сейчас — group-listener.mjs),
  // чтобы Telegram-бот мог ответить на /status, жив ли мониторинг групп.
  await sql`
    CREATE TABLE IF NOT EXISTS system_status (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Подписки на WhatsApp-бота (самообслуживание): владелец бизнеса
  // регистрируется, оплачивает переводом на Kaspi, после подтверждения
  // оплаты в админке боту выдаётся код привязки WhatsApp.
  await sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      owner_id TEXT NOT NULL UNIQUE,
      product_id TEXT NOT NULL,
      business_slug TEXT,
      business_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      contact_telegram TEXT,
      price_kzt INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      current_period_end TIMESTAMPTZ,
      pairing_code TEXT,
      reminded_3d_at TIMESTAMPTZ,
      reminded_1d_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Личный кабинет клиента: одноразовый код входа, приходит клиенту в его
  // же WhatsApp (сообщение самому себе от его бота). Один активный код на
  // подписку — новый запрос перезаписывает предыдущий.
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS otp_code TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ`;
  // Свой текст инструкции для ИИ-бота клиента (тон, что отвечать) — настраивается
  // в личном кабинете. NULL = используется общий текст по умолчанию.
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS system_prompt TEXT`;

  // Канал бота: 'whatsapp' (платно, держит сокет 24/7, требует VPS) или
  // 'telegram' (бесплатно — вебхук поверх HTTP, работает на serverless).
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS telegram_bot_username TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS telegram_webhook_secret TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS telegram_owner_chat_id BIGINT`;

  // Журнал заявок на оплату ("я оплатил") — отдельно от subscriptions,
  // чтобы не терять историю, если платёж отклонят или будет продление.
  await sql`
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id SERIAL PRIMARY KEY,
      subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'claimed',
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      confirmed_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS subscription_payments_subscription_idx
    ON subscription_payments (subscription_id)
  `;

  console.log("Готово: таблицы leads, businesses, group_leads, telegram_sessions, system_status, subscriptions, subscription_payments существуют и обновлены.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
