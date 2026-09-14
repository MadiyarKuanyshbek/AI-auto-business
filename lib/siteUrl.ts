const PRODUCTION_URL = "https://ai-automation-agency-swart.vercel.app";

/** Стабильный публичный URL сайта — не меняется от деплоя к деплою (в отличие от VERCEL_URL). */
export const SITE_URL =
  process.env.SITE_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : PRODUCTION_URL);
