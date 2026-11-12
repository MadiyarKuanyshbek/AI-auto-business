import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getPortalSubscription } from "@/lib/portalSession";
import { buildSystemPrompt, sanitizeExtraction } from "@/lib/onboarding";

// Шаг 2 мастера: сохраняем проверенные владельцем данные. Бот-консультант
// получает инструкцию, а при включённом "приёме заказов" — ещё и меню
// (с этого момента бот ведёт пошаговый заказ с подсчётом суммы).
export async function POST(request: Request) {
  const sub = await getPortalSubscription();
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!sql) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const data = sanitizeExtraction(record.data);
  if (!data) return NextResponse.json({ error: "invalid_data" }, { status: 400 });

  const enableOrders = record.enableOrders === true && data.menu_items.length > 0;
  const kaspi =
    typeof record.kaspiRequisites === "string" && record.kaspiRequisites.trim()
      ? record.kaspiRequisites.trim().slice(0, 300)
      : null;
  if (enableOrders && !kaspi) {
    return NextResponse.json({ error: "kaspi_required" }, { status: 400 });
  }

  const prompt = buildSystemPrompt(sub.business_name, data);
  const opens = data.opens && data.closes ? data.opens : null;
  const closes = data.opens && data.closes ? data.closes : null;
  const menuJson = enableOrders ? JSON.stringify(data.menu_items) : null;

  await sql`
    UPDATE subscriptions
    SET system_prompt = ${prompt}, opens_at = ${opens}, closes_at = ${closes},
        menu_items = ${menuJson}::jsonb, kaspi_requisites = ${enableOrders ? kaspi : sub.kaspi_requisites},
        updated_at = now()
    WHERE id = ${sub.id}
  `;

  return NextResponse.json({ ok: true, ordersEnabled: enableOrders });
}
