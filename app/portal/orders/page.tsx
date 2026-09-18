import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPortalSessionToken } from "@/lib/portalAuth";
import { sql, type OrderItem, type SubscriptionRow, type TelegramOrderRow } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATE_LABELS: Record<string, string> = {
  collecting: "Собирает заказ",
  delivery: "Выбирает доставку",
  address: "Вводит адрес",
  confirm: "Подтверждает",
  payment: "Ждём оплату",
  sent: "Оформлен",
  cancelled: "Отменён",
};

const STATE_STYLES: Record<string, string> = {
  collecting: "bg-amber-500/15 text-amber-400",
  delivery: "bg-amber-500/15 text-amber-400",
  address: "bg-amber-500/15 text-amber-400",
  confirm: "bg-amber-500/15 text-amber-400",
  payment: "bg-blue-500/15 text-blue-400",
  sent: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-zinc-500/15 text-zinc-400",
};

function formatItems(items: OrderItem[]): string {
  if (items.length === 0) return "—";
  return items.map((item) => `${item.qty}× ${item.name}`).join(", ");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PortalOrdersPage() {
  const secret = process.env.PORTAL_SESSION_SECRET;
  const token = (await cookies()).get("portal_session")?.value;
  const subscriptionId = secret ? await verifyPortalSessionToken(token, secret) : null;

  if (!subscriptionId || !sql) {
    redirect("/portal/login");
  }

  const [sub] = (await sql`SELECT * FROM subscriptions WHERE id = ${subscriptionId}`) as SubscriptionRow[];
  if (!sub) {
    redirect("/portal/login");
  }

  const orders = (await sql`
    SELECT * FROM telegram_orders WHERE subscription_id = ${sub.id} ORDER BY created_at DESC LIMIT 100
  `) as TelegramOrderRow[];

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/portal" className="text-sm text-muted hover:text-foreground">
          ← Назад в кабинет
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Заказы</h1>
        <p className="mt-1 text-sm text-muted">{sub.business_name} — последние {orders.length}</p>

        <div className="mt-8 space-y-3">
          {orders.length === 0 && <p className="text-sm text-muted">Заказов пока не было.</p>}
          {orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-border bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">{formatDateTime(order.created_at)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATE_STYLES[order.state] ?? ""}`}>
                  {STATE_LABELS[order.state] ?? order.state}
                </span>
              </div>
              <p className="mt-2 text-sm">{formatItems(order.items)}</p>
              <div className="mt-2 flex items-center justify-between text-sm text-muted">
                <span>
                  {order.delivery_type === "delivery"
                    ? `Доставка: ${order.address ?? "—"}`
                    : order.delivery_type === "pickup"
                      ? "Самовывоз"
                      : "—"}
                </span>
                <span className="font-medium text-foreground">
                  {order.total_kzt ? `${order.total_kzt.toLocaleString("ru-RU")} ₸` : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
