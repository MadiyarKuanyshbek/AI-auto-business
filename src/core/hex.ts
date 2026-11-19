export function bytesToHex(bytes: ArrayLike<number>, sep = " "): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(sep);
}

export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const out: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

/** Печатаемый ASCII из байтов; нули и мусор по краям убираются. */
export function bytesToAscii(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : " "))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function asciiToBytes(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0) & 0xff);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** base64 без Buffer (его нет в React Native) — нужен для react-native-ble-plx. */
export function base64Encode(bytes: ArrayLike<number>): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

export function base64Decode(text: string): number[] {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : 0));
    out.push((n[0] << 2) | (n[1] >> 4));
    if (i + 2 < clean.length) out.push(((n[1] & 15) << 4) | (n[2] >> 2));
    if (i + 3 < clean.length) out.push(((n[2] & 3) << 6) | n[3]);
  }
  return out;
}
