import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { escapeHtml, notifyOwner } from "@/lib/telegram";
import { normalizePhone, waLinkFor } from "@/lib/phone";
import { getNicheLabels } from "@/lib/products";

type Intent = "inquiry" | "purchase";
type Plan = "setup" | "subscription";

type LeadPayload = {
  name: string;
  contact: string;
  niche: string;
  comment: string;
  intent: Intent;
  plan?: Plan;
};

const NICHE_LABELS = getNicheLabels();
const PLAN_LABELS: Record<Plan, string> = {
  setup: "Разовая настройка",
  subscription: "Ежемесячная подписка",
};

function isValidPayload(value: unknown): value is LeadPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const intentOk = record.intent === undefined || record.intent === "inquiry" || record.intent === "purchase";
  const planOk = record.plan === undefined || record.plan === "setup" || record.plan === "subscription";
  return (
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    typeof record.contact === "string" &&
    record.contact.trim().length > 0 &&
    typeof record.niche === "string" &&
    typeof record.comment === "string" &&
    intentOk &&
    planOk
  );
}

function commentWithIntent(lead: LeadPayload) {
  if (lead.intent !== "purchase") return lead.comment;
  const tag = `[Покупка · ${PLAN_LABELS[lead.plan ?? "setup"]}]`;
  return lead.comment ? `${tag} ${lead.comment}` : tag;
}

async function saveLead(lead: LeadPayload) {
  if (!sql) return { skipped: true as const };

  await sql`
    INSERT INTO leads (name, contact, niche, comment, source)
    VALUES (${lead.name}, ${lead.contact}, ${NICHE_LABELS[lead.niche] || lead.niche}, ${commentWithIntent(lead)}, 'site')
  `;

  return { skipped: false as const };
}

async function notifyTelegram(lead: LeadPayload, phoneDigits: string) {
  const waLink = waLinkFor(
    phoneDigits,
    `Здравствуйте, ${lead.name}! Это Автопилот.AI, вы оставляли заявку на сайте.`,
  );

  const isPurchase = lead.intent === "purchase";

  const text = [
    isPurchase ? "🛒 <b>Готов оплатить!</b>" : "🆕 <b>Новая заявка с сайта</b>",
    `Имя: ${escapeHtml(lead.name)}`,
    `WhatsApp: ${escapeHtml(lead.contact)}`,
    `Ниша: ${escapeHtml(NICHE_LABELS[lead.niche] || lead.niche)}`,
    isPurchase ? `Пакет: ${escapeHtml(PLAN_LABELS[lead.plan ?? "setup"])}` : null,
    lead.comment ? `Комментарий: ${escapeHtml(lead.comment)}` : null,
    isPurchase ? "" : null,
    isPurchase ? "Отправьте клиенту реквизиты Kaspi для оплаты." : null,
    "",
    `<a href="${waLink}">Открыть чат в WhatsApp →</a>`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return notifyOwner(text, { html: true });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const lead: LeadPayload = {
    name: body.name.trim(),
    contact: body.contact.trim(),
    niche: body.niche.trim(),
    comment: body.comment.trim(),
    intent: body.intent ?? "inquiry",
    plan: body.plan,
  };

  // Format check only (valid-looking phone number) — confirming the number
  // is actually registered on WhatsApp needs the WhatsApp Cloud API, which
  // isn't wired in here yet. See docs/WHATSAPP_SETUP.md.
  const phoneDigits = normalizePhone(lead.contact);
  if (!phoneDigits) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  try {
    const result = await saveLead(lead);
    if (result.skipped) {
      console.warn("DATABASE_URL not set — lead was not saved to the database.");
    }

    await notifyTelegram(lead, phoneDigits);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to process lead", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
