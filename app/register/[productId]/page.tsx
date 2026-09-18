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

        <div className="mt-8">
          <SubscriptionRegisterForm productId={product.id} price={price} />
        </div>
      </div>
    </div>
  );
}
