import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { products, getDemoConfig, type Business, type Product } from "@/lib/products";
import { SITE_URL } from "@/lib/siteUrl";
import AutoPlayDemo from "@/components/AutoPlayDemo";
import WhatsAppButton from "@/components/WhatsAppButton";
import TelegramButton from "@/components/TelegramButton";

export function generateStaticParams() {
  return products.flatMap((product) =>
    product.businesses.map((business) => ({
      productId: product.id,
      businessSlug: business.slug,
    })),
  );
}

function resolve(productId: string, businessSlug: string): { product: Product; business: Business } | null {
  const product = products.find((p) => p.id === productId);
  const business = product?.businesses.find((b) => b.slug === businessSlug);
  if (!product || !business) return null;
  return { product, business };
}

export async function generateMetadata(
  props: PageProps<"/demo/[productId]/[businessSlug]">,
): Promise<Metadata> {
  const { productId, businessSlug } = await props.params;
  const resolved = resolve(productId, businessSlug);
  if (!resolved) return {};
  const { product, business } = resolved;

  const title = `Демо: ${product.objectName} для «${business.label}» — Автопилот.AI`;
  const description = product.description;
  const url = `${SITE_URL}/demo/${product.id}/${business.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, locale: "ru_RU", type: "website" },
  };
}

export default async function DemoPage(props: PageProps<"/demo/[productId]/[businessSlug]">) {
  const { productId, businessSlug } = await props.params;
  const resolved = resolve(productId, businessSlug);
  if (!resolved) notFound();
  const { product, business } = resolved;
  const config = getDemoConfig(product, business);

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-10 sm:py-16">
      <Link href="/" className="mb-8 font-display text-lg font-bold tracking-tight">
        Автопилот<span className="text-accent">.AI</span>
      </Link>

      <p className="mb-6 max-w-lg text-center text-sm text-muted">
        Так будет выглядеть переписка с вашим {product.objectName.toLowerCase()} — от
        первого сообщения клиента до готового результата.
      </p>

      <AutoPlayDemo
        objectName={product.objectName}
        businessLabel={business.label}
        businessIcon={business.icon}
        flow={product.flow}
        config={config}
      />

      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted">Хотите такую же автоматизацию для своего бизнеса?</p>
        <div className="flex flex-wrap justify-center gap-3">
          <WhatsAppButton
            message={`Здравствуйте! Видел демо для «${business.label}», хочу обсудить для своего бизнеса.`}
          />
          <TelegramButton />
          <Link
            href="/#lead-form"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/10"
          >
            Оставить заявку
          </Link>
        </div>
      </div>
    </main>
  );
}
