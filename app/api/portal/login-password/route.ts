import { NextResponse } from "next/server";
import { sql, type SubscriptionRow } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { createPortalSessionToken, verifyPortalPassword, PORTAL_REMEMBER_TTL_MS, PORTAL_SESSION_TTL_MS } from "@/lib/portalAuth";

// Запасной вход в личный кабинет — по номеру телефона и паролю, без OTP.
// Не зависит от того, привязан ли Telegram/WhatsApp: работает сразу после
// того, как владелец задал пароль (при регистрации или в настройках).
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
  const phoneDigits = normalizePhone(String(record.phone ?? ""));
  const password = String(record.password ?? "");
  const remember = record.remember !== false;

  if (!phoneDigits || !password) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const [sub] = (await sql`
    SELECT * FROM subscriptions WHERE contact_phone = ${phoneDigits} ORDER BY created_at DESC LIMIT 1
  `) as SubscriptionRow[];

  // Одна и та же ошибка на "нет такого номера" и "неверный пароль" — не
  // помогаем перебором угадывать, какие номера вообще зарегистрированы.
  if (!sub || !(await verifyPortalPassword(password, sub.portal_password_hash))) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const ttl = remember ? PORTAL_REMEMBER_TTL_MS : PORTAL_SESSION_TTL_MS;
  const token = await createPortalSessionToken(sub.id, secret, ttl);

  const response = NextResponse.json({ ok: true });
  response.cookies.set("portal_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: Math.floor(ttl / 1000),
    path: "/",
  });
  return response;
}
