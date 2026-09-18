import { NextResponse } from "next/server";
import { sql, type SubscriptionRow } from "@/lib/db";
import { escapeHtml, notifyOwner } from "@/lib/telegram";
import { products } from "@/lib/products";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sql) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const { id } = await params;
  const subId = Number(id);
  if (!Number.isInteger(subId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const [sub] = (await sql`SELECT * FROM subscriptions WHERE id = ${subId}`) as SubscriptionRow[];
  if (!sub) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (sub.status !== "pending_payment") {
    return NextResponse.json({ error: "not_pending" }, { status: 409 });
  }

  await sql`INSERT INTO subscription_payments (subscription_id, status) VALUES (${subId}, 'claimed')`;

  const productLabel = products.find((p) => p.id === sub.product_id)?.title ?? sub.product_id;

  const text = [
    "💳 <b>Клиент сообщил об оплате подписки</b>",
    `Бизнес: ${escapeHtml(sub.business_name)}`,
    `Продукт: ${escapeHtml(productLabel)}`,
    `Сумма: ${sub.price_kzt.toLocaleString("ru-RU")} ₸/мес`,
    `Контакт: ${escapeHtml(sub.contact_name)}, WhatsApp ${escapeHtml(sub.contact_phone)}`,
    "",
    "Проверьте перевод и подтвердите в /admin/subscriptions.",
  ].join("\n");

  await notifyOwner(text, { html: true });

  return NextResponse.json({ ok: true });
}
