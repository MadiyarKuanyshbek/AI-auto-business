#!/usr/bin/env node
// Автопоиск бизнесов через официальный 2GIS Catalog API (бесплатный ключ,
// без карты, без скрапинга сайтов). Заполняет часть из 20 фильтров сам,
// остальные — оставляет вам на быструю ручную проверку (см. docs).
//
// Использование:
//   TWOGIS_API_KEY=... node scripts/fetch-leads-2gis.mjs "автосервис" "Алматы" data/leads.csv
//
// ПРОВЕРЕНО НА ЖИВОМ КЛЮЧЕ (2026-09): бесплатный ключ отдаёт название,
// рубрику, рейтинг, число отзывов и координаты — но НЕ отдаёт contact_groups
// (телефон/сайт), это, судя по всему, платная часть API. Поэтому телефон
// script не заполняет сам — вместо этого даёт прямую ссылку на карточку
// 2GIS, где телефон открывается в один клик.

import { writeFileSync } from "fs";
import { stringifyCsv } from "./csv.mjs";

const CSV_COLUMNS = [
  "name",
  "industry",
  "city",
  "address",
  "card_url",
  "whatsapp",
  "telegram",
  "closed",
  "no_recurring_clients",
  "micro_no_staff",
  "uses_similar_ai",
  "enterprise_500plus",
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

// Поля, которые API объективно не даёт — оставлены на вашу ручную проверку
// (открыть ссылку на карточку в 2GIS занимает ~30 секунд на бизнес).
const MANUAL_REVIEW_COLUMNS = [
  "closed",
  "no_recurring_clients",
  "micro_no_staff",
  "uses_similar_ai",
  "enterprise_500plus",
  "long_hours",
  "has_receptionist",
  "complaints_slow",
  "has_website",
  "multi_channel",
  "runs_ads",
  "active_30d",
  "slow_dm_reply",
  "has_contact_person",
  "competitor_uses_automation",
  "no_crm",
];

// Этот бесплатный ключ ограничен page_size <= 10 — судя по всему, лимит
// самого тарифа, а не опечатка (проверено на живом ключе 2026-09).
const PAGE_SIZE = 10;

async function fetch2gis(query, city, page, apiKey) {
  const url = new URL("https://catalog.api.2gis.com/3.0/items");
  url.searchParams.set("q", `${query}, ${city}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("fields", "items.reviews,items.rubrics,items.address_name,items.point");

  const response = await fetch(url);
  const data = await response.json();

  // 2GIS возвращает ошибки внутри JSON с HTTP 200 — код ответа смотрим
  // в meta.code, а не полагаемся на response.ok. "itemNotFound" — это не
  // сбой, а просто "на этой странице/запросе ничего нет".
  if (data.meta?.error?.type === "itemNotFound") {
    return { meta: data.meta, result: { items: [], total: 0 } };
  }
  if (!response.ok || data.meta?.code >= 400) {
    const message = data.meta?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`2GIS API error (code ${data.meta?.code ?? response.status}): ${message}`);
  }

  return data;
}

function toRow(item, city, query) {
  const rating = item.reviews?.general_rating ? Number(item.reviews.general_rating) : 0;
  const reviewCount = item.reviews?.general_review_count ?? 0;

  const row = Object.fromEntries(CSV_COLUMNS.map((c) => [c, "0"]));
  row.name = item.name ?? "";
  row.industry = item.rubrics?.[0]?.name ?? query;
  row.city = city;
  // Телефона в бесплатном API нет — card_url ведёт прямо на карточку,
  // где он открывается в один клик (колонка не входит в схему скорера,
  // score-leads.mjs её просто проигнорирует).
  row.card_url = item.id ? `https://2gis.kz/firm/${item.id}` : "";
  row.address = item.address_name ?? "";
  row.rating_4plus = rating >= 4 ? "1" : "0";
  row.reviews_20plus = reviewCount >= 20 ? "1" : "0";
  row.target_industry = "1"; // вы сами задали запрос — считаем отрасль целевой
  row.matching_geo = "1"; // вы сами задали город
  row._rating = rating;
  row._reviewCount = reviewCount;
  return row;
}

async function main() {
  const [query, city, outPath = "data/leads.csv"] = process.argv.slice(2);
  const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
  const pages = pagesArg ? Number(pagesArg.split("=")[1]) : 3;
  const dumpRaw = process.argv.includes("--dump-raw");

  if (!query || !city) {
    console.error(
      'Использование: node scripts/fetch-leads-2gis.mjs "запрос" "город" [выходной.csv] [--pages=3] [--dump-raw]',
    );
    process.exit(1);
  }

  const apiKey = process.env.TWOGIS_API_KEY;
  if (!apiKey) {
    console.error("Не задан TWOGIS_API_KEY. См. docs/LEAD_QUALIFICATION_FILTERS.md — как получить бесплатный ключ.");
    process.exit(1);
  }

  const allRows = [];
  for (let page = 1; page <= pages; page++) {
    console.log(`Страница ${page}/${pages}...`);
    const data = await fetch2gis(query, city, page, apiKey);

    if (dumpRaw && page === 1) {
      writeFileSync("data/2gis-raw-sample.json", JSON.stringify(data, null, 2), "utf-8");
      console.log("Сохранил сырой ответ API в data/2gis-raw-sample.json для проверки полей.");
    }

    const items = data.result?.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      allRows.push(toRow(item, city, query));
    }
  }

  // Сортируем так, чтобы самые перспективные (рейтинг + отзывы) оказались
  // сверху — их и стоит проверить вручную в первую очередь.
  allRows.sort((a, b) => b._rating - a._rating || b._reviewCount - a._reviewCount);
  allRows.forEach((r) => {
    delete r._rating;
    delete r._reviewCount;
  });

  writeFileSync(outPath, stringifyCsv(CSV_COLUMNS, allRows), "utf-8");

  console.log(`\nНайдено бизнесов: ${allRows.length}`);
  console.log(`Сохранено в ${outPath}`);
  console.log(
    `\nДальше: откройте файл, для верхних строк (самые перспективные) перейдите по card_url —` +
      ` там телефон в один клик, скопируйте в колонку whatsapp. Заодно проставьте 1/0 в колонках —` +
      ` ${MANUAL_REVIEW_COLUMNS.join(", ")} — так, как реально видите по карточке. Затем запустите:\n  node scripts/score-leads.mjs ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
