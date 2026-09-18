import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Бесплатный тир Gemini иногда отвечает 503 ("high demand") или 429
// (rate limit) — это временные сбои, есть смысл повторить попытку.
const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

const PRIMARY_MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-flash-lite-latest";

const FALLBACK_REPLY = "Принял ваш запрос! Менеджер свяжется с вами в течение 2 минут.";

async function tryModel(modelName: string, prompt: string, userMessage: string) {
  const model = genAI.getGenerativeModel({ model: modelName });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent(`${prompt}\n\n${userMessage}`);
      return result.response.text();
    } catch (err) {
      const status = (err as { status?: number }).status;
      const isRetryable = status !== undefined && RETRYABLE_STATUS.has(status);
      if (!isRetryable || attempt === MAX_ATTEMPTS) throw err;

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
    return await tryModel(PRIMARY_MODEL, prompt, userMessage);
  } catch (primaryErr) {
    console.error(`Primary model (${PRIMARY_MODEL}) failed, trying fallback:`, primaryErr);
    try {
      return await tryModel(FALLBACK_MODEL, prompt, userMessage);
    } catch (fallbackErr) {
      console.error(`Fallback model (${FALLBACK_MODEL}) also failed:`, fallbackErr);
      return FALLBACK_REPLY;
    }
  }
}
