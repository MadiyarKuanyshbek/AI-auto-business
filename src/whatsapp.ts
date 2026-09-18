import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { isPersonalContact } from './contacts';
import { generateAiReply } from './gemini';
import { notifyOwner } from '../lib/telegram';

const AI_SYSTEM_PROMPT =
  'Ты — AI-администратор бизнеса в WhatsApp. Отвечай кратко, дружелюбно и по делу.';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Бэкофф на переподключение: без лимита сбойный Wi-Fi/сеть заставит Baileys
// долбить сервер WhatsApp реконнектами без остановки, а антиспам-алгоритмы
// WhatsApp расценят это как атаку и могут забанить номер.
const RECONNECT_DELAYS_MS = [1000, 3000, 7000, 15000, 30000];
const reconnectAttempts = new Map<string, number>();

// Владельцы, остановленные намеренно (waManager.stopBot) — чтобы обработчик
// close не боролся с этим и не запускал реконнект для сокета, который
// закрыли специально (истёкшая подписка и т.п.).
const stoppedOwners = new Set<string>();

export function markStopped(ownerId: string) {
  stoppedOwners.add(ownerId);
  reconnectAttempts.delete(ownerId);
}

export async function initWhatsApp(ownerId: string, phoneNumber?: string) {
  const { state, saveCreds } = await useMultiFileAuthState(`./sessions/owner_${ownerId}`);
  // Версия WA Web зашита в baileys и быстро устаревает — с устаревшей версией
  // сервер WhatsApp принимает соединение, но отклоняет привязку устройства.
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection) {
      console.log(`[owner ${ownerId}] connection: ${connection}`);
    }

    if (connection === 'open') {
      reconnectAttempts.delete(ownerId);
    }

    if (connection === 'close') {
      if (stoppedOwners.delete(ownerId)) {
        console.log(`[owner ${ownerId}] stopped intentionally — not reconnecting`);
        return;
      }

      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      console.log(
        `[owner ${ownerId}] disconnected (code ${statusCode ?? 'unknown'}):`,
        lastDisconnect?.error?.message,
      );

      // loggedOut — реальный разрыв (вышли из аккаунта на телефоне),
      // переподключаться бессмысленно, нужна новая привязка вручную.
      if (statusCode === DisconnectReason.loggedOut) {
        reconnectAttempts.delete(ownerId);
        notifyOwner(`⚠️ WhatsApp-бот (owner ${ownerId}) разлогинен. Нужна повторная привязка номера.`);
        return;
      }

      // Code 515 (restart required) — WhatsApp сам обрывает соединение сразу
      // после подтверждения кода на телефоне и требует переподключиться тем
      // же сеансом, чтобы завершить привязку устройства. Остальные разрывы —
      // сетевые сбои. В обоих случаях переподключаемся, но с бэкоффом и
      // лимитом попыток, а не мгновенно и бесконечно.
      const attempt = (reconnectAttempts.get(ownerId) ?? 0) + 1;
      if (attempt > RECONNECT_DELAYS_MS.length) {
        reconnectAttempts.delete(ownerId);
        console.error(`[owner ${ownerId}] reconnect limit reached, giving up`);
        notifyOwner(
          `🔴 WhatsApp-бот (owner ${ownerId}) не смог переподключиться после ${RECONNECT_DELAYS_MS.length} попыток. Требуется ручная проверка.`,
        );
        return;
      }

      reconnectAttempts.set(ownerId, attempt);
      const reconnectDelay = RECONNECT_DELAYS_MS[attempt - 1];
      console.log(`[owner ${ownerId}] reconnect attempt ${attempt} in ${reconnectDelay}ms`);
      delay(reconnectDelay).then(() =>
        initWhatsApp(ownerId).catch((err) => console.error(`[owner ${ownerId}] reconnect failed:`, err)),
      );
    }
  });

  let pairingCode: string | undefined;
  if (phoneNumber && !sock.authState.creds.registered) {
    // requestPairingCode до открытия WebSocket-соединения падает с 428
    // (Precondition Required) — даём сокету время подключиться.
    await delay(3000);
    try {
      pairingCode = await sock.requestPairingCode(phoneNumber);
      console.log(`\n=================================`);
      console.log(`PAIRING CODE (owner ${ownerId}): ${pairingCode}`);
      console.log(`=================================\n`);
    } catch (err) {
      console.error('Ошибка генерации кода привязки:', err);
    }
  }

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe !== false) continue;

      const from = msg.key.remoteJid;
      if (!from || from.endsWith('@g.us')) continue;

      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        '';

      if (!text) continue;

      console.log(`Incoming message from ${from}: ${text}`);

      try {
        // Отмечает сообщение прочитанным — у отправителя галочки станут синими.
        await sock.readMessages([msg.key]);
      } catch (err) {
        console.error(`[owner ${ownerId}] failed to mark message as read:`, err);
      }

      if (isPersonalContact(ownerId, msg.key.remoteJid, msg.key.remoteJidAlt)) {
        console.log(`[owner ${ownerId}] ${from} is a personal contact — skipping AI auto-reply`);
        continue;
      }

      try {
        const reply = await generateAiReply(AI_SYSTEM_PROMPT, text);
        await sock.sendMessage(from, { text: reply });
      } catch (err) {
        console.error(`[owner ${ownerId}] failed to reply to ${from}:`, err);
      }
    }
  });

  return { sock, pairingCode };
}
