// Текст инструкции для ИИ-бота каждого владельца — хранится в памяти демона,
// а не берётся из БД на каждое сообщение (это был бы лишний запрос на
// каждый входящий чат). waManager.startBot подгружает его из БД при старте,
// app/api/portal/settings обновляет "на лету" через bridge (см.
// src/waBridgeServer.ts), whatsapp.ts читает актуальное значение при каждом
// сообщении. Отдельный модуль — чтобы whatsapp.ts и waManager.ts не
// импортировали друг друга по кругу.
export const DEFAULT_SYSTEM_PROMPT =
  'Ты — AI-администратор бизнеса в WhatsApp. Отвечай кратко, дружелюбно и по делу.';

const prompts = new Map<string, string>();

export function setSystemPrompt(ownerId: string, prompt: string | null | undefined) {
  if (prompt && prompt.trim()) {
    prompts.set(ownerId, prompt.trim());
  } else {
    prompts.delete(ownerId);
  }
}

export function getSystemPrompt(ownerId: string): string {
  return prompts.get(ownerId) ?? DEFAULT_SYSTEM_PROMPT;
}
