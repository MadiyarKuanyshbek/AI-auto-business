import { NextResponse } from "next/server";
import { sql, type SubscriptionRow } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { createPortalSessionToken, PORTAL_SESSION_TTL_MS } from "@/lib/portalAuth";

export async function POST(request: Request) {
  if (!sql) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const phoneDigits = normalizePhone(typeof record.phone === "string" ? record.phone : "");
  const code = typeof record.code === "string" ? record.code.trim() : "";

  if (!phoneDigits || !code) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const [sub] = (await sql`
    SELECT * FROM subscriptions WHERE contact_phone = ${phoneDigits} ORDER BY created_at DESC LIMIT 1
  `) as SubscriptionRow[];

  if (
    !sub ||
    !sub.otp_code ||
    sub.otp_code !== code ||
    !sub.otp_expires_at ||
    new Date(sub.otp_expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  await sql`UPDATE subscriptions SET otp_code = NULL, otp_expires_at = NULL WHERE id = ${sub.id}`;

  const token = await createPortalSessionToken(sub.id, secret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("portal_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: PORTAL_SESSION_TTL_MS / 1000,
  });
  return response;
}
