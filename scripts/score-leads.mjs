#!/usr/bin/env node
// Бесплатный скрипт квалификации лидов: node scripts/score-leads.mjs data/leads.csv
// Ничего не отправляет клиентам сам — только считает баллы и готовит
// персональное предложение под каждый бизнес отдельно (см. draftMessage).
// Отправлять клиенту — вручную. Флаг --push кладёт результат вместе с
// готовым текстом в Postgres (таблица businesses), чтобы всё было видно в
// админке на сайте — это не отправка сообщения клиенту, а просто сохранение
// списка с черновиками для вас.

import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { parseCsv } from "./csv.mjs";

const RED_FLAGS = [
  "closed",
  "no_recurring_clients",
  "micro_no_staff",
  "uses_similar_ai",
  "enterprise_500plus",
];

const SCORE_FIELDS = [
  "long_hours",
  "has_receptionist",
  "complaints_slow",
  "rating_4plus",
  "reviews_20plus",
  "has_website",
  "multi_channel",
  "runs_ads",
  "active_30d",
  "slow_dm_reply",
  "target_industry",
  "has_contact_person",
  "matching_geo",
  "competitor_uses_automation",
  "no_crm",
];

// Ниша (колонка "niche" из find-clients.mjs) → какой из 5 продуктов ей
// подходит и как его коротко описать. Значения соответствуют lib/products.ts —
// продублировано здесь, чтобы не тащить TypeScript-импорт в обычный node-скрипт.
const NICHE_TO_PRODUCT = {
  auto: { objectName: "ИИ-приёмщик", pitch: "отвечает клиентам в WhatsApp и Telegram 24/7, консультирует по цене ремонта и сам записывает на удобное время" },
  clinic: { objectName: "ИИ-приёмщик", pitch: "отвечает пациентам 24/7, подсказывает по услугам и сам записывает на приём" },
  beauty: { objectName: "ИИ-приёмщик", pitch: "отвечает клиентам в WhatsApp и Telegram 24/7, консультирует по услугам и сам записывает на удобное время" },
  hotel: { objectName: "ИИ-приёмщик", pitch: "отвечает на бронирования 24/7 и сам подтверждает даты заезда" },
  realty: { objectName: "ИИ-приёмщик", pitch: "отвечает на вопросы по объектам 24/7 и сам назначает просмотры" },
  "it-company": { objectName: "ИИ-сисадмин", pitch: "мониторит сервисы и логи, перехватывает ошибки и сам перезапускает упавшие процессы" },
  "web-studio": { objectName: "ИИ-сисадмин", pitch: "следит за сервисами клиентов и сразу сообщает дежурному о сбоях" },
  retail: { objectName: "ИИ-аналитик", pitch: "переводит вопросы в SQL-запрос и выдаёт отчёт по выручке или остаткам за секунды" },
  warehouse: { objectName: "ИИ-аналитик", pitch: "мгновенно считает остатки и формирует отчёты без ручной сверки" },
  "online-school": { objectName: "ИИ-модератор", pitch: "отвечает на частые вопросы в чате и сразу пересылает горячие заявки в отдел продаж" },
};

const DEFAULT_PRODUCT = {
  objectName: "ИИ-администратор",
  pitch: "отвечает клиентам в WhatsApp и Telegram 24/7 и снимает с вас рутинные вопросы",
};

// Приоритет подсказок: берём первую верную по порядку — так сообщение ведёт
// с самой релевантной болью именно этого бизнеса, а не общими словами.
const HOOKS = [
  ["complaints_slow", (name) => `Заметил отзывы клиентов ${name} про долгий ответ или недозвон`],
  ["slow_dm_reply", () => "Вижу, что в директе ответы идут не сразу"],
  ["long_hours", () => "У вас долгий рабочий день — заявки наверняка приходят и тогда, когда в зале никого нет"],
  ["has_receptionist", () => "У вас есть отдельный администратор, и на нём наверняка виснут однотипные вопросы «сколько стоит» и «когда можно»"],
  ["no_crm", () => "Похоже, записи пока ведутся не через CRM, а значит часть заявок теряется"],
  ["multi_channel", () => "У вас несколько каналов связи одновременно, и клиентам легко потеряться, кому и где писать"],
  ["runs_ads", () => "Вы вкладываетесь в рекламу, и обидно терять часть заявок просто потому, что на них не успели ответить"],
];

const SITE_DEMO_LINK = process.env.SITE_URL
  ? `${process.env.SITE_URL.replace(/\/$/, "")}/#products`
  : "https://ai-automation-agency-swart.vercel.app/#products";
const QUALIFY_THRESHOLD = Number(process.env.QUALIFY_THRESHOLD || 8);

function isTrue(value) {
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function pickHook(lead) {
  const name = lead.name || "у вас";
  for (const [field, build] of HOOKS) {
    if (isTrue(lead[field] || "0")) return build(name);
  }
  if (isTrue(lead.rating_4plus || "0") && isTrue(lead.reviews_20plus || "0")) {
    return `У ${name} хороший рейтинг и много отзывов — важно не терять этот поток заявок на однотипных вопросах`;
  }
  return null;
}

function draftMessage(lead) {
  const name = lead.name || "ваш бизнес";
  const product = NICHE_TO_PRODUCT[lead.niche] || DEFAULT_PRODUCT;
  const hook = pickHook(lead);

  const opening = hook
    ? `Здравствуйте! ${hook}.`
    : `Здравствуйте! Пишу по поводу ${name}.`;

  return (
    `${opening} Мы делаем ${product.objectName}: он ${product.pitch}. ` +
    `Можно посмотреть живое демо для вашей сферы прямо на сайте, без регистрации: ${SITE_DEMO_LINK} ` +
    `Если откликнется — за 2 минуты покажу, как это настроить у вас, без обязательств.`
  );
}

async function pushToDatabase(results) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Не задан DATABASE_URL — пропускаю --push. См. docs/ADMIN_SETUP.md.");
    return;
  }

  const sql = neon(url);
  let pushed = 0;

  for (const { lead, score, isRedFlagged, pitch } of results) {
    const qualified = !isRedFlagged && score >= QUALIFY_THRESHOLD;
    try {
      const result = await sql`
        INSERT INTO businesses (name, industry, city, address, card_url, whatsapp, score, qualified, pitch)
        VALUES (${lead.name || ""}, ${lead.industry || ""}, ${lead.city || ""}, ${lead.address || ""}, ${lead.card_url || ""}, ${lead.whatsapp || ""}, ${score}, ${qualified}, ${pitch})
        ON CONFLICT (card_url) WHERE card_url <> '' DO NOTHING
        RETURNING id
      `;
      if (result.length > 0) pushed++;
    } catch (error) {
      console.error(`Не удалось сохранить "${lead.name}": ${error.message}`);
    }
  }

  console.log(
    `\nДобавлено в базу (таблица businesses): ${pushed}/${results.length} ` +
      `(остальные уже были в базе по card_url — пропущены, не задублированы).`,
  );
}

async function main() {
  const filePath = process.argv[2];
  const shouldPush = process.argv.includes("--push");

  if (!filePath) {
    console.error("Использование: node scripts/score-leads.mjs data/leads.csv [--push]");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(filePath, "utf-8"));

  const results = rows.map((lead) => {
    const isRedFlagged = RED_FLAGS.some((field) => isTrue(lead[field] || "0"));
    const score = SCORE_FIELDS.reduce(
      (sum, field) => sum + (isTrue(lead[field] || "0") ? 1 : 0),
      0,
    );
    return { lead, isRedFlagged, score, pitch: draftMessage(lead) };
  });

  const qualified = results
    .filter((r) => !r.isRedFlagged && r.score >= QUALIFY_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const excluded = results.filter((r) => r.isRedFlagged || r.score < QUALIFY_THRESHOLD);

  console.log(`\nВсего лидов: ${results.length}`);
  console.log(`Прошли порог (>= ${QUALIFY_THRESHOLD} баллов, без red flags): ${qualified.length}`);
  console.log(`Отсечено: ${excluded.length}\n`);

  qualified.forEach(({ lead, score, pitch }) => {
    console.log("─".repeat(60));
    console.log(`${lead.name} (${lead.industry || "?"}, ${lead.city || "?"}) — балл: ${score}`);
    console.log(`Контакт: WhatsApp ${lead.whatsapp || "—"} / Telegram ${lead.telegram || "—"}`);
    console.log(`Персональное предложение:\n${pitch}\n`);
  });

  if (shouldPush) {
    await pushToDatabase(results);
  }
}

main();
