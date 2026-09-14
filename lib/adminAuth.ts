const encoder = new TextEncoder();

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
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

// "Запомнить меня": сессия держится долго сама по себе — раз вошли,
// пароль больше не спросит, пока сами не нажмёте "Забыть меня".
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 365; // 1 год

export async function createAdminSessionToken(secret: string) {
  const expiry = Date.now() + SESSION_TTL_MS;
  const key = await getKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(expiry)));
  return `${expiry}.${toBase64Url(signature)}`;
}

export async function verifyAdminSessionToken(token: string | undefined, secret: string) {
  if (!token) return false;
  const [expiryStr, sig] = token.split(".");
  if (!expiryStr || !sig) return false;

  const expiry = Number(expiryStr);
  if (!expiry || Date.now() > expiry) return false;

  const key = await getKey(secret);
  const expectedSignature = await crypto.subtle.sign("HMAC", key, encoder.encode(expiryStr));
  return timingSafeEqual(toBase64Url(expectedSignature), sig);
}
