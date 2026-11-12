import { sql, type SubscriptionRow } from "@/lib/db";
import { escapeHtml, notifyOwner, sendTelegramMessageAs } from "@/lib/telegram";
import { generateJsonReply } from "@/src/gemini";

const DEFAULT_SYSTEM_PROMPT = "Ты — ИИ-администратор бизнеса в Telegram.";
const HISTORY_LIMIT = 8;
const AI_TIMEOUT_MS = 15000;
const TIMEOUT_REPLY = "Принял ваш запрос! Отвечу чуть позже.";
const LEAD_DEDUP_HOURS = 2;

type ConsultAnswer = {
  reply?: string;
  lead?: { name?: string | null; phone?: string | null; summary?: string | null } | null;
};

type LogRow = { role: string; text: string };

const RULES = `Правила (важнее всего остального):
- Отвечай коротко, дружелюбно, на языке клиента (русский или казахский). Не выдумывай цены, адреса и услуги — используй только информацию выше.
- Если информации нет — честно скажи, что уточнишь у администратора, и предложи оставить имя и телефон.
- Если клиент хочет записаться, заказать или чтобы с ним связались: спроси имя и номер телефона (если ещё не назвал) и уточни, что именно нужно (услуга, дата/время).
- Ты НЕ подтверждаешь запись и наличие свободного времени сам: говори, что передал заявку администратору и он свяжется для подтверждения. Никогда не пиши "вы записаны".
- Когда у тебя есть и телефон, и суть заявки — заполни поле lead. Пока телефона нет — lead должен быть null.
- Ответ строго в формате JSON: {"reply": "текст ответа клиенту", "lead": null или {"name": "...", "phone": "...", "summary": "что нужно клиенту"}}`;

async function loadHistory(subscriptionId: number, chatId: number): Promise<LogRow[]> {
  if (!sql) return [];
  const rows = (await sql`
    SELECT role, text FROM bot_chat_log
    WHERE subscription_id = ${subscriptionId} AND chat_id = ${chatId}
      AND role IN ('user', 'bot') AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT}
  `) as LogRow[];
  return rows.reverse();
}

async function remember(subscriptionId: number, chatId: number, role: string, text: string) {
  if (!sql) return;
  await sql`
    INSERT INTO bot_chat_log (subscription_id, chat_id, role, text)
    VALUES (${subscriptionId}, ${chatId}, ${role}, ${text.slice(0, 2000)})
  `;
}

async function leadAlreadySent(subscriptionId: number, chatId: number): Promise<boolean> {
  if (!sql) return false;
  const rows = await sql`
    SELECT 1 FROM bot_chat_log
    WHERE subscription_id = ${subscriptionId} AND chat_id = ${chatId} AND role = 'lead'
      AND created_at > now() - make_interval(hours => ${LEAD_DEDUP_HOURS})
    LIMIT 1
  `;
  return rows.length > 0;
}

async function deliverLead(
  sub: SubscriptionRow,
  lead: NonNullable<ConsultAnswer["lead"]>,
  customer: { name: string | null; username: string | null },
) {
  const lines = [
    `📩 <b>Новая заявка — ${escapeHtml(sub.business_name)}</b>`,
    lead.name ? `Имя: ${escapeHtml(lead.name)}` : customer.name ? `Имя в Telegram: ${escapeHtml(customer.name)}` : null,
    `Телефон: ${escapeHtml(lead.phone ?? "")}`,
    customer.username ? `Telegram: @${escapeHtml(customer.username)}` : null,
    lead.summary ? `Запрос: ${escapeHtml(lead.summary)}` : null,
  ].filter(Boolean);
  const text = lines.join("\n");

  if (sub.telegram_bot_token && sub.telegram_owner_chat_id !== null) {
    const result = await sendTelegramMessageAs(sub.telegram_bot_token, sub.telegram_owner_chat_id, text, { html: true });
    if (result.ok) return;
  }
  // Владелец ещё не привязал Telegram — не теряем заявку, шлём агентству.
  await notifyOwner(`${text}\n\n⚠️ Владелец бизнеса не привязал Telegram — перешлите заявку ему.`, { html: true });
}

/**
 * Свободный диалог бота-консультанта: помнит последние реплики клиента,
 * сам собирает имя и телефон и передаёт готовую заявку владельцу.
 * Возвращает текст ответа клиенту.
 */
export async function processConsultMessage(
  sub: SubscriptionRow,
  message: { chatId: number; text: string; customerName: string | null; username: string | null },
): Promise<string> {
  const history = await loadHistory(sub.id, message.chatId);
  const historyText = history.map((h) => `${h.role === "user" ? "Клиент" : "Бот"}: ${h.text}`).join("\n");

  const prompt = `${sub.system_prompt || DEFAULT_SYSTEM_PROMPT}\n\n${RULES}`;
  const userPart = `${historyText ? `Предыдущие сообщения:\n${historyText}\n\n` : ""}Новое сообщение клиента: ${message.text}`;

  const answer = await Promise.race([
    generateJsonReply<ConsultAnswer>(prompt, userPart),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_TIMEOUT_MS)),
  ]);

  const reply = answer?.reply?.trim() || TIMEOUT_REPLY;

  await remember(sub.id, message.chatId, "user", message.text);
  await remember(sub.id, message.chatId, "bot", reply);

  const lead = answer?.lead;
  if (lead?.phone && /\d{7,}/.test(lead.phone.replace(/\D/g, "")) && !(await leadAlreadySent(sub.id, message.chatId))) {
    await remember(sub.id, message.chatId, "lead", lead.summary ?? lead.phone);
    await deliverLead(sub, lead, { name: message.customerName, username: message.username });
  }

  return reply;
}
