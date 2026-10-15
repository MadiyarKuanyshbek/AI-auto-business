import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { sql } from "@/lib/db";
import { escapeHtml, notifyOwner } from "@/lib/telegram";
import { SITE_URL } from "@/lib/siteUrl";
import { normalizePhone } from "@/lib/phone";

export const maxDuration = 60;

// Ниша → поисковый запрос для 2GIS. Дублирует QUERY_MAP из
// scripts/find-clients.mjs (тот скрипт — для ручного точечного запуска с
// произвольными фильтрами, этот роут — для регулярного автопрогона по
// умолчанию, см. vercel.json).
const QUERY_MAP: Record<string, string> = {
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

const NICHE_TO_PRODUCT: Record<string, string> = {
  auto: "ИИ-приёмщик: отвечает клиентам 24/7 и сам записывает на удобное время",
  clinic: "ИИ-приёмщик: отвечает пациентам 24/7 и сам записывает на приём",
  beauty: "ИИ-приёмщик: отвечает клиентам 24/7 и сам записывает на удобное время",
  hotel: "ИИ-приёмщик: отвечает на бронирования 24/7",
  realty: "ИИ-приёмщик: отвечает на вопросы по объектам и назначает просмотры",
  "it-company": "ИИ-сисадмин: мониторит сервисы и перехватывает ошибки",
  "web-studio": "ИИ-сисадмин: следит за сервисами клиентов",
  retail: "ИИ-аналитик: отчёты по выручке и остаткам за секунды",
  warehouse: "ИИ-аналитик: считает остатки без ручной сверки",
  "online-school": "ИИ-модератор: отвечает на частые вопросы и пересылает горячие заявки",
};

const PAGE_SIZE = 10;
const REQUEST_DELAY_MS = 350;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GisItem = {
  id?: string;
  name?: string;
  address_name?: string;
  rubrics?: { name?: string }[];
  reviews?: { general_rating?: string; general_review_count?: number };
  contact_groups?: { contacts?: { type?: string; value?: string; text?: string }[] }[];
};

/** Первый мобильный (7xx…) номер из карточки 2GIS — только такие подходят для WhatsApp. */
function pickMobilePhone(item: GisItem): string {
  for (const group of item.contact_groups ?? []) {
    for (const contact of group.contacts ?? []) {
      if (contact.type !== "phone") continue;
      const digits = normalizePhone(contact.value ?? contact.text ?? "");
      if (digits && /^77\d{9}$/.test(digits)) return digits;
    }
  }
  return "";
}

async function fetch2gis(query: string, city: string, apiKey: string, page: number): Promise<GisItem[]> {
  const url = new URL("https://catalog.api.2gis.com/3.0/items");
  url.searchParams.set("q", `${query}, ${city}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("fields", "items.reviews,items.rubrics,items.address_name,items.point,items.contact_groups");

  const response = await fetch(url);
  const data = await response.json();
  if (data.meta?.error?.type === "itemNotFound") return [];
  if (!response.ok || data.meta?.code >= 400) {
    throw new Error(`2GIS API error (code ${data.meta?.code ?? response.status})`);
  }
  return data.result?.items ?? [];
}

/** Черновик — собран только из того, что даёт бесплатный 2GIS API. Остальные сигналы (жалобы, часы работы и т.п.) требуют ручной проверки, как и раньше через score-leads.mjs. */
function buildPitch(item: GisItem, niche: string) {
  const name = item.name || "ваш бизнес";
  const product = NICHE_TO_PRODUCT[niche] || "ИИ-администратор: отвечает клиентам 24/7";
  return (
    `Здравствуйте! Пишу по поводу ${name}. Мы делаем ${product}. ` +
    `Можно посмотреть живое демо для вашей сферы прямо на сайте: ${SITE_URL}/#products`
  );
}

async function loadKnownCardUrls(): Promise<Set<string>> {
  if (!sql) return new Set();
  const rows = (await sql`SELECT card_url FROM businesses WHERE card_url IS NOT NULL AND card_url <> ''`) as {
    card_url: string;
  }[];
  return new Set(rows.map((r) => r.card_url));
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.TWOGIS_API_KEY;
  if (!apiKey || !sql) {
    return NextResponse.json({ skipped: true, reason: !apiKey ? "no_2gis_key" : "no_database" });
  }

  const cities = (process.env.DISCOVER_CITIES || "Алматы,Астана")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const niches = (process.env.DISCOVER_NICHES || Object.keys(QUERY_MAP).join(","))
    .split(",")
    .map((n) => n.trim())
    .filter((n) => QUERY_MAP[n]);

  // Cron идёт каждый день — листаем выдачу 2GIS по кругу (страницы 1–10), иначе
  // каждый запуск возвращал бы одних и тех же уже известных бизнесов.
  const dayNumber = Math.floor(new Date().getTime() / 86_400_000);
  const page = (dayNumber % 10) + 1;

  const knownCardUrls = await loadKnownCardUrls();
  const found: { name: string; niche: string; city: string; cardUrl: string; score: number; pitch: string; phone: string }[] = [];

  for (const niche of niches) {
    const query = QUERY_MAP[niche];
    for (const city of cities) {
      let items: GisItem[];
      try {
        items = await fetch2gis(query, city, apiKey, page);
      } catch (error) {
        console.error(`2GIS ${niche}/${city} failed:`, error instanceof Error ? error.message : error);
        continue;
      }
      await sleep(REQUEST_DELAY_MS);

      for (const item of items) {
        const cardUrl = item.id ? `https://2gis.kz/firm/${item.id}` : "";
        if (!cardUrl || knownCardUrls.has(cardUrl)) continue;
        knownCardUrls.add(cardUrl);

        const rating = item.reviews?.general_rating ? Number(item.reviews.general_rating) : 0;
        const reviewCount = item.reviews?.general_review_count ?? 0;
        // Только сигналы, которые реально даёт бесплатный API — остальные (жалобы,
        // часы работы, CRM и т.п.) по-прежнему требуют ручной проверки в /admin.
        const score = (rating >= 4 ? 1 : 0) + (reviewCount >= 20 ? 1 : 0);

        found.push({
          name: item.name || "",
          niche,
          city,
          cardUrl,
          score,
          pitch: buildPitch(item, niche),
          phone: pickMobilePhone(item),
        });

        try {
          await sql`
            INSERT INTO businesses (name, industry, city, address, card_url, score, qualified, pitch, whatsapp)
            VALUES (${item.name || ""}, ${item.rubrics?.[0]?.name || query}, ${city}, ${item.address_name || ""}, ${cardUrl}, ${score}, false, ${buildPitch(item, niche)}, ${pickMobilePhone(item)})
            ON CONFLICT (card_url) WHERE card_url <> '' DO NOTHING
          `;
        } catch (error) {
          console.error(`Failed to insert "${item.name}":`, error instanceof Error ? error.message : error);
        }
      }
    }
  }

  if (found.length > 0) {
    found.sort((a, b) => b.score - a.score);
    const top = found.slice(0, 10);
    const lines = [
      `🔎 <b>Автопоиск нашёл ${found.length} новых бизнесов</b>`,
      "",
      ...top.map((f) => {
        // wa.me с готовым текстом: одно нажатие — открывается WhatsApp с персональным
        // сообщением, остаётся только нажать «Отправить» (автоотправка запрещена
        // правилами WhatsApp и ведёт к бану номера).
        const wa = f.phone ? ` — <a href="https://wa.me/${f.phone}?text=${encodeURIComponent(f.pitch)}">написать в WhatsApp</a>` : " — без мобильного номера";
        return `• ${escapeHtml(f.name)} (${escapeHtml(f.niche)}, ${escapeHtml(f.city)}), балл ${f.score}${wa}`;
      }),
      found.length > top.length ? `…и ещё ${found.length - top.length} в /admin.` : null,
    ].filter(Boolean);
    await notifyOwner(lines.join("\n"), { html: true });
  }

  return NextResponse.json({ ok: true, found: found.length });
}
