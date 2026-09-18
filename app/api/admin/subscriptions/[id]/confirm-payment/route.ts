import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/adminAuth";
import { sql, type SubscriptionRow } from "@/lib/db";

async function isAuthorized(request: Request) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return verifyAdminSessionToken(match?.[1], secret);
}

async function startBotViaBridge(ownerId: string, phoneNumber: string) {
  const bridgeUrl = process.env.WA_BRIDGE_URL ?? "http://127.0.0.1:4001";
  const secret = process.env.INTERNAL_BRIDGE_SECRET;

  const response = await fetch(`${bridgeUrl}/bots/${ownerId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret ?? "",
    },
    body: JSON.stringify({ phoneNumber }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`bridge responded ${response.status}`);
  }

  return (await response.json()) as { pairingCode?: string };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  let pairingCode: string | undefined;
  try {
    const result = await startBotViaBridge(sub.owner_id, sub.contact_phone);
    pairingCode = result.pairingCode;
  } catch (err) {
    console.error(`Failed to start bot for subscription ${subId} via bridge:`, err);
    // Подписку НЕ активируем без реального кода привязки — демон может быть
    // ещё не запущен (например, локальная разработка без wa-daemon).
    return NextResponse.json({ error: "daemon_unreachable" }, { status: 502 });
  }

  await sql`
    UPDATE subscription_payments SET status = 'confirmed', confirmed_at = now()
    WHERE subscription_id = ${subId} AND status = 'claimed'
  `;

  await sql`
    UPDATE subscriptions
    SET status = 'active', current_period_end = now() + interval '30 days',
        pairing_code = ${pairingCode ?? null}, updated_at = now()
    WHERE id = ${subId}
  `;

  return NextResponse.json({ ok: true, pairingCode });
}
