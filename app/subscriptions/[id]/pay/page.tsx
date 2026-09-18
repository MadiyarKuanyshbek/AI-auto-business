import { redirect, notFound } from "next/navigation";
import { sql, type SubscriptionRow } from "@/lib/db";
import { products } from "@/lib/products";
import MarkPaidButton from "@/components/MarkPaidButton";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subId = Number(id);
  if (!Number.isInteger(subId) || !sql) notFound();

  const [sub] = (await sql`SELECT * FROM subscriptions WHERE id = ${subId}`) as SubscriptionRow[];
  if (!sub) notFound();

  // Уже оплачено/обрабатывается — незачем снова показывать реквизиты.
  if (sub.status !== "pending_payment") {
    redirect(`/subscriptions/${subId}/status`);
  }

  const productLabel = products.find((p) => p.id === sub.product_id)?.title ?? sub.product_id;
  const requisites = process.env.KASPI_REQUISITES_TEXT ?? "Реквизиты уточняются — свяжитесь с нами.";

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Оплата подписки</h1>
        <p className="mt-2 text-sm text-muted">
          {sub.business_name} · {productLabel}
        </p>

        <div className="mt-4 rounded-2xl border border-border bg-white/5 p-4">
          <p className="text-sm text-muted">К оплате</p>
          <p className="text-xl font-semibold">{sub.price_kzt.toLocaleString("ru-RU")} ₸</p>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-white/5 p-4">
          <p className="text-sm font-medium">Реквизиты для перевода на Kaspi</p>
          <p className="mt-2 whitespace-pre-line text-sm text-muted">{requisites}</p>
        </div>

        <p className="mt-4 text-xs text-muted">
          После перевода нажмите «Я оплатил» — мы проверим платёж и включим бота, обычно в течение пары часов.
        </p>

        <div className="mt-6">
          <MarkPaidButton subscriptionId={subId} />
        </div>
      </div>
    </div>
  );
}
