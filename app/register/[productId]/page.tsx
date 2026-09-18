import Link from "next/link";
import { notFound } from "next/navigation";
import { products } from "@/lib/products";
import { getSubscriptionPrice } from "@/lib/subscriptionPricing";
import SubscriptionRegisterForm from "@/components/SubscriptionRegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const product = products.find((p) => p.id === productId);
  const price = getSubscriptionPrice(productId);

  if (!product || price === null) notFound();

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← На главную
        </Link>

        <h1 className="mt-4 text-2xl font-bold">
          {product.icon} {product.title}
        </h1>
        <p className="mt-2 text-sm text-muted">{product.description}</p>

        <div className="mt-4 rounded-2xl border border-border bg-white/5 p-4">
          <p className="text-sm text-muted">Ежемесячная подписка</p>
          <p className="text-xl font-semibold">{price.toLocaleString("ru-RU")} ₸ / мес</p>
          <p className="mt-1 text-xs text-muted">
            Бот работает 24/7, пока подписка активна. Оплата — переводом на Kaspi, подтверждаем вручную.
          </p>
        </div>

        <div className="mt-8">
          <SubscriptionRegisterForm productId={product.id} />
        </div>
      </div>
    </div>
  );
}
