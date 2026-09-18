import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { products } from "@/lib/products";
import { getBotInfo, registerBotCommands, registerWebhook } from "@/lib/telegramClientBot";
import { SITE_URL } from "@/lib/siteUrl";
import { hashPortalPassword } from "@/lib/portalAuth";

type TelegramSubscriptionPayload = {
  productId: string;
  businessSlug?: string;
  businessName: string;
  contactName: string;
  contactPhone: string;
  botToken: string;
  portalPassword: string;
};

function isValidPayload(value: unknown): value is TelegramSubscriptionPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.productId === "string" &&
    record.productId.trim().length > 0 &&
    (record.businessSlug === undefined || typeof record.businessSlug === "string") &&
    typeof record.businessName === "string" &&
    record.businessName.trim().length > 0 &&
    typeof record.contactName === "string" &&
    record.contactName.trim().length > 0 &&
    typeof record.contactPhone === "string" &&
    typeof record.botToken === "string" &&
    record.botToken.trim().length > 0 &&
    typeof record.portalPassword === "string" &&
    record.portalPassword.trim().length >= 4
  );
}

export async function POST(request: Request) {
  if (!sql) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const product = products.find((p) => p.id === body.productId);
  if (!product) {
    return NextResponse.json({ error: "invalid_product" }, { status: 400 });
  }
  if (body.businessSlug && !product.businesses.some((b) => b.slug === body.businessSlug)) {
    return NextResponse.json({ error: "invalid_business_slug" }, { status: 400 });
  }

  const phoneDigits = normalizePhone(body.contactPhone);
  if (!phoneDigits) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const botToken = body.botToken.trim();
  const botInfo = await getBotInfo(botToken);
  if (!botInfo) {
    return NextResponse.json({ error: "invalid_bot_token" }, { status: 400 });
  }

  // Тот же приём, что у WhatsApp-регистрации: owner_id узнаём только после
  // INSERT, временный плейсхолдер защищает от коллизии двух параллельных заявок.
  const placeholderOwnerId = `pending_${crypto.randomUUID()}`;
  const webhookSecret = crypto.randomUUID().replace(/-/g, "");
  const portalPasswordHash = await hashPortalPassword(body.portalPassword.trim());

  const [row] = await sql`
    INSERT INTO subscriptions (
      owner_id, product_id, business_slug, business_name, contact_name,
      contact_phone, price_kzt, status, channel,
      telegram_bot_token, telegram_bot_username, telegram_webhook_secret, portal_password_hash
    )
    VALUES (
      ${placeholderOwnerId}, ${product.id}, ${body.businessSlug ?? null}, ${body.businessName.trim()}, ${body.contactName.trim()},
      ${phoneDigits}, 0, 'active', 'telegram',
      ${botToken}, ${botInfo.username}, ${webhookSecret}, ${portalPasswordHash}
    )
    RETURNING id
  `;

  const id = row.id as number;
  const ownerId = `sub_${id}`;
  await sql`UPDATE subscriptions SET owner_id = ${ownerId} WHERE id = ${id}`;

  const webhookUrl = `${SITE_URL}/api/telegram/client/${ownerId}`;
  const registered = await registerWebhook(botToken, webhookUrl, webhookSecret);
  if (!registered) {
    // Подписку не откатываем — токен рабочий (getBotInfo прошёл), просто
    // setWebhook мог не пройти из-за временного сбоя Telegram; владелец
    // сможет пересохранить токен в настройках личного кабинета позже.
    console.error(`Failed to register Telegram webhook for owner ${ownerId}`);
  }
  await registerBotCommands(botToken);

  return NextResponse.json({ id, botUsername: botInfo.username });
}
