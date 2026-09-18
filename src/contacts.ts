import fs from "fs";
import path from "path";

const CONTACTS_FILE = path.join(process.cwd(), "contacts", "personal-contacts.json");

function normalizePhone(jid?: string | null): string {
  if (!jid) return "";
  return jid.split("@")[0].split(":")[0].replace(/\D/g, "");
}

function loadPersonalContacts(ownerId: string): Set<string> {
  try {
    const raw = fs.readFileSync(CONTACTS_FILE, "utf-8");
    const data = JSON.parse(raw) as Record<string, string[]>;
    return new Set((data[ownerId] ?? []).map((phone) => phone.replace(/\D/g, "")));
  } catch {
    return new Set();
  }
}

/** JID у WhatsApp бывает в формате @lid (новый ID) или @s.whatsapp.net (номер) —
 * поэтому сверяем сразу оба варианта (remoteJid и remoteJidAlt). */
export function isPersonalContact(ownerId: string, ...jids: (string | null | undefined)[]): boolean {
  const personal = loadPersonalContacts(ownerId);
  if (personal.size === 0) return false;
  return jids.some((jid) => {
    const phone = normalizePhone(jid);
    return phone !== "" && personal.has(phone);
  });
}
