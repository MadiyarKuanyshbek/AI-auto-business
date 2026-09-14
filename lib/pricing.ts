// Черновые вилки цен (KZT) по каждому продукту — см. docs/PRICING.md.
// НЕ окончательные, пока не показываются на сайте — только для внутреннего
// использования в Telegram, когда нужно быстро назвать ориентир клиенту.
export type PriceRange = { setupMin: number; setupMax: number; subMin: number; subMax: number };

export const PRICING: Record<string, PriceRange> = {
  "front-desk": { setupMin: 150_000, setupMax: 250_000, subMin: 35_000, subMax: 60_000 },
  infra: { setupMin: 250_000, setupMax: 400_000, subMin: 80_000, subMax: 150_000 },
  "internal-ops": { setupMin: 200_000, setupMax: 300_000, subMin: 50_000, subMax: 90_000 },
  "data-admin": { setupMin: 200_000, setupMax: 350_000, subMin: 60_000, subMax: 100_000 },
  community: { setupMin: 100_000, setupMax: 180_000, subMin: 25_000, subMax: 45_000 },
};

function formatKzt(n: number) {
  return `${n.toLocaleString("ru-RU")} ₸`;
}

export function formatPriceRange(range: PriceRange) {
  return `Настройка: ${formatKzt(range.setupMin)}–${formatKzt(range.setupMax)} · Подписка: ${formatKzt(range.subMin)}–${formatKzt(range.subMax)}/мес`;
}
