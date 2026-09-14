/** Vercel Cron шлёт заголовок Authorization: Bearer $CRON_SECRET — так отличаем плановый запуск от случайного внешнего запроса на тот же URL. */
export function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
