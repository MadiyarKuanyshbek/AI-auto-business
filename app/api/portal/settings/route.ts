import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql, type SubscriptionRow } from "@/lib/db";
import { verifyPortalSessionToken } from "@/lib/portalAuth";

async function requireSubscription(): Promise<SubscriptionRow | null> {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret || !sql) return null;
  const token = (await cookies()).get("portal_session")?.value;
  const subscriptionId = await verifyPortalSessionToken(token, secret);
  if (!subscriptionId) return null;
  const [sub] = (await sql`SELECT * FROM subscriptions WHERE id = ${subscriptionId}`) as SubscriptionRow[];
  return sub ?? null;
}

async function pushPromptToBridge(ownerId: string, text: string) {
  const bridgeUrl = process.env.WA_BRIDGE_URL ?? "http://127.0.0.1:4001";
  const secret = process.env.INTERNAL_BRIDGE_SECRET;
  try {
    await fetch(`${bridgeUrl}/bots/${ownerId}/set-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": secret ?? "" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    // Не критично — при следующем рестарте демона промпт всё равно
    // подхватится из БД (см. waManager.startBot). Просто не обновится "на лету".
    console.error(`Failed to hot-reload prompt for owner ${ownerId}:`, err);
  }
}

export async function GET() {
  const sub = await requireSubscription();
  if (!sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    systemPrompt: sub.system_prompt,
    opensAt: sub.opens_at?.slice(0, 5) ?? null,
    closesAt: sub.closes_at?.slice(0, 5) ?? null,
  });
}

export async function POST(request: Request) {
  const sub = await requireSubscription();
  if (!sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sql) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const raw = "systemPrompt" in record ? String(record.systemPrompt) : "";
  const systemPrompt = raw.trim().slice(0, 2000) || null;

  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
  function parseTime(value: unknown): string | null {
    if (typeof value !== "string" || !TIME_RE.test(value)) return null;
    return value;
  }
  const opensAt = parseTime(record.opensAt);
  const closesAt = parseTime(record.closesAt);
  // Часы работы задаются только парой — если одно из полей не пришло валидным,
  // считаем, что ограничение снимается целиком (бот снова работает круглосуточно).
  const opens = opensAt && closesAt ? opensAt : null;
  const closes = opensAt && closesAt ? closesAt : null;

  await sql`
    UPDATE subscriptions
    SET system_prompt = ${systemPrompt}, opens_at = ${opens}, closes_at = ${closes}, updated_at = now()
    WHERE id = ${sub.id}
  `;

  // Telegram-вебхук читает system_prompt из БД на каждое сообщение — моста
  // не нужно. Только у WhatsApp промпт кэшируется в памяти демона (VPS).
  if (sub.channel === "whatsapp") {
    await pushPromptToBridge(sub.owner_id, systemPrompt ?? "");
  }

  return NextResponse.json({ ok: true });
}
