import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPortalSessionToken } from "@/lib/portalAuth";
import { sql, type SubscriptionRow } from "@/lib/db";
import { products } from "@/lib/products";
import PortalLogoutButton from "@/components/portal/PortalLogoutButton";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Ждём оплату",
  active: "Активна",
  expired: "Истекла",
  cancelled: "Отменена",
};

export default async function PortalPage() {
  const secret = process.env.PORTAL_SESSION_SECRET;
  const token = (await cookies()).get("portal_session")?.value;
  const subscriptionId = secret ? await verifyPortalSessionToken(token, secret) : null;

  if (!subscriptionId) {
    redirect("/portal/login");
  }
  if (!sql) {
    redirect("/portal/login");
  }

  const [sub] = (await sql`SELECT * FROM subscriptions WHERE id = ${subscriptionId}`) as SubscriptionRow[];
  if (!sub) {
    redirect("/portal/login");
  }

  const productLabel = products.find((p) => p.id === sub.product_id)?.title ?? sub.product_id;
  const needsRenewal = sub.status === "expired" || sub.status === "pending_payment";

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Личный кабинет</h1>
          <PortalLogoutButton />
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-white/5 p-6">
          <p className="text-sm text-muted">{sub.business_name}</p>
          <p className="mt-1 text-lg font-semibold">{productLabel}</p>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted">Статус</span>
            <span className="font-medium">{STATUS_LABELS[sub.status] ?? sub.status}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted">Стоимость</span>
            <span className="font-medium">{sub.price_kzt.toLocaleString("ru-RU")} ₸/мес</span>
          </div>
          {sub.current_period_end && (
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted">Действует до</span>
              <span className="font-medium">{new Date(sub.current_period_end).toLocaleDateString("ru-RU")}</span>
            </div>
          )}
        </div>

        {needsRenewal && (
          <Link
            href={`/subscriptions/${sub.id}/pay`}
            className="mt-6 block w-full rounded-full bg-accent px-6 py-3 text-center text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Продлить подписку
          </Link>
        )}
      </div>
    </div>
  );
}
