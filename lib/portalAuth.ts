// Сессия личного кабинета клиента — по образцу lib/adminAuth.ts, но токен
// несёт subscriptionId (кабинетов много, у каждого свой), а не просто факт
// входа. Секрет отдельный от ADMIN_PASSWORD — это разные субъекты доверия.
const encoder = new TextEncoder();

async function getKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// "Запомнить меня" — сессия держится долго (как в админке). Без галочки —
// только на время этой сессии браузера, разумно для чужого/общего устройства.
export const PORTAL_REMEMBER_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 дней
export const PORTAL_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 часов

export async function createPortalSessionToken(subscriptionId: number, secret: string, ttlMs: number) {
  const expiry = Date.now() + ttlMs;
  const payload = `${subscriptionId}.${expiry}`;
  const key = await getKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifyPortalSessionToken(token: string | undefined, secret: string): Promise<number | null> {
  if (!token) return null;
  const [idStr, expiryStr, sig] = token.split(".");
  if (!idStr || !expiryStr || !sig) return null;

  const expiry = Number(expiryStr);
  if (!expiry || Date.now() > expiry) return null;

  const payload = `${idStr}.${expiryStr}`;
  const key = await getKey(secret);
  const expectedSignature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  if (!timingSafeEqual(toBase64Url(expectedSignature), sig)) return null;

  const subscriptionId = Number(idStr);
  return Number.isInteger(subscriptionId) ? subscriptionId : null;
}
