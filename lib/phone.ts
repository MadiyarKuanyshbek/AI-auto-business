/**
 * Normalizes a free-typed phone number into a WhatsApp-ready digit string
 * (no "+", no spaces). Returns null if it doesn't look like a real phone
 * number at all — this is a format check, not a "is this on WhatsApp" check
 * (that requires the WhatsApp Cloud API, see docs/WHATSAPP_SETUP.md).
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  if (!digits) return null;

  // Common KZ/RU typo: "8 700 ..." instead of "+7 700 ...".
  if (!hasPlus && digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }

  if (digits.length < 10 || digits.length > 15) return null;

  return digits;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

export function waLinkFor(phoneDigits: string, message?: string) {
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${phoneDigits}${query}`;
}
