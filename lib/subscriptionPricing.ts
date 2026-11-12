// Цена самообслуживания: бот, который клиент подключает сам (7 дней бесплатно).
// Остальные продукты (infra, internal-ops, data-admin, community) делаются
// только под заказ по заявке — самостоятельной регистрации и цены у них нет,
// чтобы не продавать то, что не работает "из коробки".
export const SUBSCRIPTION_PRICE_KZT: Record<string, number> = {
  "front-desk": 19_900,
};

/** Разовая цена, если мы подключаем и настраиваем бота за клиента (по заявке). */
export const TURNKEY_SETUP_KZT = 30_000;

export function getSubscriptionPrice(productId: string): number | null {
  return SUBSCRIPTION_PRICE_KZT[productId] ?? null;
}

export function isSelfServe(productId: string): boolean {
  return getSubscriptionPrice(productId) !== null;
}
