import type { WASocket } from '@whiskeysockets/baileys';
import { initWhatsApp, markStopped } from './whatsapp';
import { setSystemPrompt } from './systemPrompts';
import { sql } from '../lib/db';

type BotEntry = {
  sock: WASocket;
};

const bots = new Map<string, BotEntry>();

export type BotStatus = 'connected' | 'connecting' | 'not_started';

/** Запускает бота для владельца (новая привязка, если передан номер) и
 * держит сокет в памяти демона, пока его явно не остановят. */
export async function startBot(ownerId: string, phoneNumber?: string) {
  // Подхватываем персональный промпт клиента из БД до первого сообщения —
  // иначе первые чаты после рестарта демона отвечали бы дефолтным текстом.
  if (sql) {
    try {
      const [row] = (await sql`SELECT system_prompt FROM subscriptions WHERE owner_id = ${ownerId}`) as {
        system_prompt: string | null;
      }[];
      setSystemPrompt(ownerId, row?.system_prompt);
    } catch (err) {
      console.error(`[waManager] failed to load system prompt for owner ${ownerId}:`, err);
    }
  }

  const { sock, pairingCode } = await initWhatsApp(ownerId, phoneNumber);
  bots.set(ownerId, { sock });
  return { pairingCode };
}

/** Останавливает бота владельца (истёкшая/отменённая подписка) — сессия на
 * диске остаётся, чтобы при повторной активации не пришлось перепривязывать. */
export function stopBot(ownerId: string) {
  const entry = bots.get(ownerId);
  if (!entry) return false;
  markStopped(ownerId);
  entry.sock.end(new Error('stopped by waManager'));
  bots.delete(ownerId);
  return true;
}

export function getStatus(ownerId: string): BotStatus {
  const entry = bots.get(ownerId);
  if (!entry) return 'not_started';
  return entry.sock.user ? 'connected' : 'connecting';
}

export function getSocket(ownerId: string): WASocket | undefined {
  return bots.get(ownerId)?.sock;
}

/** Отправляет сообщение владельцу бота от него самого себе ("Message
 * Yourself") — используется и для напоминаний об окончании подписки
 * (src/subscriptionScheduler.ts), и для одноразовых кодов входа в личный
 * кабинет (app/api/portal/request-code). Возвращает false, если бот сейчас
 * не подключён — вызывающий код решает, что делать (повторить позже и т.п.). */
export async function notifySelf(ownerId: string, text: string): Promise<boolean> {
  const sock = getSocket(ownerId);
  if (!sock?.user) return false;
  try {
    await sock.sendMessage(sock.user.id, { text });
    return true;
  } catch (err) {
    console.error(`[waManager] failed to notify owner ${ownerId} via self-message:`, err);
    return false;
  }
}

export function listActiveOwnerIds(): string[] {
  return [...bots.keys()];
}
