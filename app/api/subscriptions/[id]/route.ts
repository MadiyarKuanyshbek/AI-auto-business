import { NextResponse } from "next/server";
import { sql, type SubscriptionRow } from "@/lib/db";

// Публичная ручка (без авторизации) — отдаёт только статус, код привязки и
// дату окончания. Никаких контактов/телефонов клиента здесь не возвращаем.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sql) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const { id } = await params;
  const subId = Number(id);
  if (!Number.isInteger(subId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const [sub] = (await sql`
    SELECT status, pairing_code, current_period_end FROM subscriptions WHERE id = ${subId}
  `) as Pick<SubscriptionRow, "status" | "pairing_code" | "current_period_end">[];

  if (!sub) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    status: sub.status,
    pairingCode: sub.pairing_code,
    currentPeriodEnd: sub.current_period_end,
  });
}
