import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { products } from "@/lib/products";
import { getSubscriptionPrice } from "@/lib/subscriptionPricing";
import { hashPortalPassword } from "@/lib/portalAuth";

type SubscriptionPayload = {
  productId: string;
  businessSlug?: string;
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactTelegram?: string;
  portalPassword: string;
};

function isValidPayload(value: unknown): value is SubscriptionPayload {
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
    (record.contactTelegram === undefined || typeof record.contactTelegram === "string") &&
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

  const price = getSubscriptionPrice(product.id);
  if (price === null) {
    return NextResponse.json({ error: "no_price_for_product" }, { status: 400 });
  }

  const phoneDigits = normalizePhone(body.contactPhone);
  if (!phoneDigits) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  // owner_id уникален и NOT NULL, а финальное значение (sub_<id>) узнаём
  // только после INSERT — временно пишем случайный плейсхолдер, чтобы два
  // параллельных запроса не столкнулись на одинаковом значении.
  const placeholderOwnerId = `pending_${crypto.randomUUID()}`;
  const portalPasswordHash = await hashPortalPassword(body.portalPassword.trim());

  const [row] = await sql`
    INSERT INTO subscriptions (
      owner_id, product_id, business_slug, business_name, contact_name,
      contact_phone, contact_telegram, price_kzt, portal_password_hash
    )
    VALUES (
      ${placeholderOwnerId}, ${product.id}, ${body.businessSlug ?? null}, ${body.businessName.trim()}, ${body.contactName.trim()},
      ${phoneDigits}, ${body.contactTelegram?.trim() || null}, ${price}, ${portalPasswordHash}
    )
    RETURNING id
  `;

  const id = row.id as number;
  await sql`UPDATE subscriptions SET owner_id = ${`sub_${id}`} WHERE id = ${id}`;

  return NextResponse.json({ id });
}
