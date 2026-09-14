#!/usr/bin/env node
// Пакетный, аккуратный поиск клиентов для агентства через официальный 2GIS
// Catalog API. В отличие от fetch-leads-2gis.mjs (один запрос — один город),
// этот скрипт:
//   1) проходит сразу несколько ниш и городов за один запуск;
//   2) не повторяет бизнесы, которые уже есть в базе (таблица businesses) —
//      чтобы не тратить время на повторную ручную проверку одних и тех же
//      карточек при регулярных запусках;
//   3) делает паузу между запросами к API, чтобы не долбить бесплатный
//      тариф — это и есть "аккуратно" в названии задачи.
// Ничего никому не пишет и не звонит — только собирает список для ручной
// проверки и последующей отправки вами лично (см. docs/LEAD_QUALIFICATION_FILTERS.md).
//
// Использование:
//   TWOGIS_API_KEY=... node scripts/find-clients.mjs --cities="Алматы,Астана" [--niches=auto,beauty] [--pages=2] [--out=data/leads.csv]
//
// Без --niches ищет по всем нишам, для которых поиск по картам вообще имеет
// смысл (см. QUERY_MAP ниже) — блогеров/медиа/бренды 2GIS не найдёт, это
// не физические точки на карте.

import { writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { stringifyCsv } from "./csv.mjs";

const CSV_COLUMNS = [
  "name",
  "niche",
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

// Ниша (slug из lib/products.ts) → поисковый запрос для 2GIS. Только для
// ниш, которые реально ищутся как точки на карте — комьюнити-продукт
// (блогеры/медиа/бренды) сюда не входит, это не физический бизнес.
const QUERY_MAP = {
  auto: "автосервис",
  clinic: "медицинская клиника",
  beauty: "салон красоты",
  hotel: "отель",
  realty: "агентство недвижимости",
  "it-company": "IT компания",
  "web-studio": "веб студия",
  retail: "магазин одежды",
  warehouse: "склад логистика",
  "online-school": "языковая школа",
};

const PAGE_SIZE = 10; // лимит бесплатного тарифа 2GIS, проверено на живом ключе
const REQUEST_DELAY_MS = 350; // пауза между запросами — не долбим бесплатный API

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetch2gis(query, city, page, apiKey) {
  const url = new URL("https://catalog.api.2gis.com/3.0/items");
  url.searchParams.set("q", `${query}, ${city}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("fields", "items.reviews,items.rubrics,items.address_name,items.point");

  const response = await fetch(url);
  const data = await response.json();

  if (data.meta?.error?.type === "itemNotFound") {
    return { meta: data.meta, result: { items: [], total: 0 } };
  }
  if (!response.ok || data.meta?.code >= 400) {
    const message = data.meta?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`2GIS API error (code ${data.meta?.code ?? response.status}): ${message}`);
  }

  return data;
}

function toRow(item, city, niche, query) {
  const rating = item.reviews?.general_rating ? Number(item.reviews.general_rating) : 0;
  const reviewCount = item.reviews?.general_review_count ?? 0;

  const row = Object.fromEntries(CSV_COLUMNS.map((c) => [c, "0"]));
  row.name = item.name ?? "";
  row.niche = niche;
  row.industry = item.rubrics?.[0]?.name ?? query;
  row.city = city;
  row.card_url = item.id ? `https://2gis.kz/firm/${item.id}` : "";
  row.address = item.address_name ?? "";
  row.rating_4plus = rating >= 4 ? "1" : "0";
  row.reviews_20plus = reviewCount >= 20 ? "1" : "0";
  row.target_industry = "1";
  row.matching_geo = "1";
  row._rating = rating;
  row._reviewCount = reviewCount;
  return row;
}

async function loadKnownCardUrls() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL не задан — пропускаю дедупликацию против базы (это ок, просто первый запуск).");
    return new Set();
  }
  const sql = neon(url);
  const rows = await sql`SELECT card_url FROM businesses WHERE card_url IS NOT NULL AND card_url <> ''`;
  return new Set(rows.map((r) => r.card_url));
}

function parseListArg(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return arg
    .slice(name.length + 3)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const cities = parseListArg("cities", []);
  if (cities.length === 0) {
    console.error(
      'Укажите хотя бы один город: node scripts/find-clients.mjs --cities="Алматы,Астана" [--niches=auto,beauty] [--pages=2]',
    );
    process.exit(1);
  }

  const requestedNiches = parseListArg("niches", Object.keys(QUERY_MAP));
  const unknownNiches = requestedNiches.filter((n) => !QUERY_MAP[n]);
  if (unknownNiches.length > 0) {
    console.error(
      `Неизвестные или не подходящие для поиска по карте ниши: ${unknownNiches.join(", ")}. ` +
        `Доступные: ${Object.keys(QUERY_MAP).join(", ")}`,
    );
    process.exit(1);
  }

  const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
  const pages = pagesArg ? Number(pagesArg.split("=")[1]) : 2;
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const outPath = outArg ? outArg.split("=")[1] : "data/leads.csv";

  const apiKey = process.env.TWOGIS_API_KEY;
  if (!apiKey) {
    console.error("Не задан TWOGIS_API_KEY. См. docs/LEAD_QUALIFICATION_FILTERS.md — как получить бесплатный ключ.");
    process.exit(1);
  }

  console.log(`Ниши: ${requestedNiches.join(", ")}`);
  console.log(`Города: ${cities.join(", ")}`);
  console.log(`Страниц на комбинацию: ${pages} (до ${pages * PAGE_SIZE} бизнесов на нишу+город)\n`);

  const knownCardUrls = await loadKnownCardUrls();
  const seenInThisRun = new Set();
  const allRows = [];
  let skippedKnown = 0;

  for (const niche of requestedNiches) {
    const query = QUERY_MAP[niche];
    for (const city of cities) {
      for (let page = 1; page <= pages; page++) {
        console.log(`[${niche} / ${city}] страница ${page}/${pages}...`);
        const data = await fetch2gis(query, city, page, apiKey);
        const items = data.result?.items ?? [];
        if (items.length === 0) break;

        for (const item of items) {
          const cardUrl = item.id ? `https://2gis.kz/firm/${item.id}` : "";
          if (cardUrl && (knownCardUrls.has(cardUrl) || seenInThisRun.has(cardUrl))) {
            skippedKnown++;
            continue;
          }
          if (cardUrl) seenInThisRun.add(cardUrl);
          allRows.push(toRow(item, city, niche, query));
        }

        await sleep(REQUEST_DELAY_MS);
      }
    }
  }

  allRows.sort((a, b) => b._rating - a._rating || b._reviewCount - a._reviewCount);
  allRows.forEach((r) => {
    delete r._rating;
    delete r._reviewCount;
  });

  writeFileSync(outPath, stringifyCsv(CSV_COLUMNS, allRows), "utf-8");

  console.log(`\nНовых бизнесов найдено: ${allRows.length}`);
  console.log(`Пропущено как уже известные (есть в базе или дубль в этом запуске): ${skippedKnown}`);
  console.log(`Сохранено в ${outPath}`);
  console.log(
    `\nДальше: откройте файл, для верхних строк перейдите по card_url — там телефон в один клик, ` +
      `скопируйте в колонку whatsapp, проставьте 1/0 в оставшихся колонках. Затем:\n  node scripts/score-leads.mjs ${outPath} --push`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
