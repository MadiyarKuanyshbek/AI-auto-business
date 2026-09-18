import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 503 ("high demand") — временный сбой, есть смысл быстро повторить.
// 429 бывает двух видов: короткий per-minute лимит (стоит подождать секунду)
// и суточная квота free tier (retryDelay в ответе — десятки секунд); повторять
// суточную квоту в рамках одного запроса бессмысленно — сразу уходим на fallback-модель.
const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_ATTEMPTS = 2;
const BASE_DELAY_MS = 300;

// Псевдонимы "-latest" сейчас указывают на gemini-3.8-flash — самую новую
// preview-модель, у которой бесплатный тир урезан до 20 запросов/сутки на
// проект (это и роняло бота в проде). Пришпиленные более старые версии дают
// штатный, куда более щедрый бесплатный лимит — используем их вместо алиасов.
// Обе — "-lite": не "думающие" модели (нет thoughtsTokenCount), отвечают
// заметно быстрее полной gemini-3.5-flash — это критично для сценария заказа,
// где ответ должен укладываться в таймаут вебхука Telegram.
const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";

const FALLBACK_REPLY = "Принял ваш запрос! Менеджер свяжется с вами в течение 2 минут.";

function isDailyQuotaExhausted(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /PerDay/i.test(message) || /generate_content_free_tier_requests/i.test(message);
}

async function tryModel(modelName: string, prompt: string, userMessage: string, json: boolean) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    // temperature: 0 — для JSON-разбора заказа важна повторяемость, а не
    // креативность; со стандартной температурой модель на одном и том же
    // сообщении иногда подставляла случайную не ту позицию меню.
    generationConfig: json ? { responseMimeType: "application/json", temperature: 0 } : undefined,
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent(`${prompt}\n\n${userMessage}`);
      return result.response.text();
    } catch (err) {
      const status = (err as { status?: number }).status;
      const isRetryable = status !== undefined && RETRYABLE_STATUS.has(status);
      if (!isRetryable || isDailyQuotaExhausted(err) || attempt === MAX_ATTEMPTS) throw err;

      // Экспоненциальный бэкофф + джиттер, чтобы параллельные ретраи не
      // долбили API синхронной пачкой в один и тот же момент.
      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);
      const jitter = Math.random() * BASE_DELAY_MS;
      await delay(backoff + jitter);
    }
  }

  throw new Error("unreachable");
}

export async function generateAiReply(prompt: string, userMessage: string) {
  try {
    return await tryModel(PRIMARY_MODEL, prompt, userMessage, false);
  } catch (primaryErr) {
    console.error(`Primary model (${PRIMARY_MODEL}) failed, trying fallback:`, primaryErr);
    try {
      return await tryModel(FALLBACK_MODEL, prompt, userMessage, false);
    } catch (fallbackErr) {
      console.error(`Fallback model (${FALLBACK_MODEL}) also failed:`, fallbackErr);
      return FALLBACK_REPLY;
    }
  }
}

/**
 * Для сценариев, где ответ должен быть строго структурированным (например,
 * разбор заказа по меню) — просим у Gemini чистый JSON и парсим его. При
 * сбое обеих моделей или невалидном JSON возвращаем null, а не догадки:
 * денежные суммы в заказе должен всегда считать код, а не ИИ.
 */
export async function generateJsonReply<T>(prompt: string, userMessage: string): Promise<T | null> {
  const raw = await (async () => {
    try {
      return await tryModel(PRIMARY_MODEL, prompt, userMessage, true);
    } catch (primaryErr) {
      console.error(`Primary model (${PRIMARY_MODEL}) failed (json), trying fallback:`, primaryErr);
      try {
        return await tryModel(FALLBACK_MODEL, prompt, userMessage, true);
      } catch (fallbackErr) {
        console.error(`Fallback model (${FALLBACK_MODEL}) also failed (json):`, fallbackErr);
        return null;
      }
    }
  })();

  if (!raw) return null;
  console.log(`[gemini] raw JSON text: ${raw}`);
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error("Failed to parse Gemini JSON response:", err, raw);
    return null;
  }
}
