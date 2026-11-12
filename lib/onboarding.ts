import type { MenuItem } from "@/lib/db";

/** Что Gemini вытащил из прайса/меню/описания бизнеса. */
export type ExtractedBusiness = {
  summary: string;
  address: string | null;
  phone: string | null;
  opens: string | null;
  closes: string | null;
  services: { name: string; price: number | null; note?: string | null }[];
  orderable: boolean;
  menu_items: MenuItem[];
};

export const EXTRACTION_PROMPT = `Ты помогаешь владельцу малого бизнеса в Казахстане настроить бота. Из присланного текста/файла (прайс, меню, описание, фото) извлеки данные и верни СТРОГО JSON:
{
 "summary": "2-3 предложения: что за бизнес и чем занимается (на русском)",
 "address": "адрес или null",
 "phone": "телефон для связи или null",
 "opens": "время открытия HH:MM или null",
 "closes": "время закрытия HH:MM или null",
 "services": [{"name": "название услуги/товара", "price": число в тенге или null, "note": "важная деталь (длительность, вес, условия) или null"}],
 "orderable": true если это еда/товары, которые клиент заказывает по меню и платит заранее (кафе, фастфуд, магазин); false для услуг с записью (салон, клиника, СТО),
 "menu_items": [{"name": "точное название позиции", "price": целое число в тенге}]
}
Правила:
- Цены только целым числом в тенге (убери ₸, тг, пробелы). Если цена "от 5000" — бери 5000 и добавь в note "от".
- Не выдумывай. Чего нет в источнике — null или пустой массив.
- menu_items заполняй, только если orderable = true и у позиции есть цена. Если позиция существует в нескольких вариантах (размер, порция) — отдельная позиция на каждый вариант с понятным названием ("Донер говяжий 250 г").
- Не больше 150 позиций. Названия на языке источника.`;

function clampTime(value: string | null | undefined): string | null {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

/** Приводит сырой ответ модели к безопасной структуре (модель может вернуть что угодно). */
export function sanitizeExtraction(raw: unknown): ExtractedBusiness | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };

  const services = (Array.isArray(r.services) ? r.services : [])
    .map((s) => {
      const item = (s ?? {}) as Record<string, unknown>;
      const name = str(item.name, 120);
      return name ? { name, price: num(item.price), note: str(item.note, 120) } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .slice(0, 200);

  const menu_items: MenuItem[] = (Array.isArray(r.menu_items) ? r.menu_items : [])
    .map((m) => {
      const item = (m ?? {}) as Record<string, unknown>;
      const name = str(item.name, 120);
      const price = num(item.price);
      return name && price ? { name, price } : null;
    })
    .filter((m): m is MenuItem => m !== null)
    .slice(0, 150);

  const summary = str(r.summary, 600);
  if (!summary && services.length === 0 && menu_items.length === 0) return null;

  return {
    summary: summary ?? "",
    address: str(r.address, 200),
    phone: str(r.phone, 40),
    opens: clampTime(str(r.opens, 5)),
    closes: clampTime(str(r.closes, 5)),
    services,
    orderable: r.orderable === true && menu_items.length > 0,
    menu_items,
  };
}

/** Инструкция для бота-консультанта, собранная из подтверждённых владельцем данных. */
export function buildSystemPrompt(businessName: string, data: ExtractedBusiness): string {
  const lines = [
    `Ты — ИИ-администратор «${businessName}». ${data.summary}`.trim(),
    data.address ? `Адрес: ${data.address}` : null,
    data.phone ? `Телефон: ${data.phone}` : null,
    data.opens && data.closes ? `Часы работы: ${data.opens}–${data.closes}` : null,
    data.services.length
      ? "Услуги и цены:\n" +
        data.services
          .map((s) => `- ${s.name}${s.price ? ` — ${s.price.toLocaleString("ru-RU")} ₸` : ""}${s.note ? ` (${s.note})` : ""}`)
          .join("\n")
      : null,
  ].filter(Boolean);
  return lines.join("\n").slice(0, 8000);
}
