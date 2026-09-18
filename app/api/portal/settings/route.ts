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
  return NextResponse.json({ systemPrompt: sub.system_prompt });
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

  const raw =
    typeof body === "object" && body !== null && "systemPrompt" in body
      ? String((body as { systemPrompt: unknown }).systemPrompt)
      : "";
  const systemPrompt = raw.trim().slice(0, 2000) || null;

  await sql`UPDATE subscriptions SET system_prompt = ${systemPrompt}, updated_at = now() WHERE id = ${sub.id}`;
  await pushPromptToBridge(sub.owner_id, systemPrompt ?? "");

  return NextResponse.json({ ok: true });
}
