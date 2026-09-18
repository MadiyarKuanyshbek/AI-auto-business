// Фиксированная цена ежемесячной подписки по каждому продукту (см. lib/products.ts).
// Середина черновых диапазонов (см. память проекта) — до явного пересмотра ценообразования.
export const SUBSCRIPTION_PRICE_KZT: Record<string, number> = {
  "front-desk": 47_500,
  infra: 115_000,
  "internal-ops": 70_000,
  "data-admin": 80_000,
  community: 35_000,
};

export function getSubscriptionPrice(productId: string): number | null {
  return SUBSCRIPTION_PRICE_KZT[productId] ?? null;
}
