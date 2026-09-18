import { sql, type SubscriptionRow } from "@/lib/db";
import { products } from "@/lib/products";
import ConfirmSubscriptionPaymentButton from "@/components/admin/ConfirmSubscriptionPaymentButton";
import ChannelBadge from "@/components/admin/ChannelBadge";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Ждём оплату",
  active: "Активна",
  expired: "Истекла",
  cancelled: "Отменена",
};

const STATUS_STYLES: Record<string, string> = {
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  expired: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  cancelled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400",
};

export default async function AdminSubscriptionsPage() {
  let subscriptions: SubscriptionRow[] = [];
  let dbError: string | null = null;

  if (sql) {
    try {
      subscriptions = (await sql`SELECT * FROM subscriptions ORDER BY created_at DESC`) as SubscriptionRow[];
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Неизвестная ошибка";
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Подписки ({subscriptions.length})</h1>
      <p className="mt-1 text-sm text-zinc-500">Полная история — все статусы, для справки.</p>

      {dbError && (
        <p className="mt-4 rounded-lg bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-500/15 dark:text-red-400">
          Ошибка БД: {dbError}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2">Бизнес</th>
              <th className="px-4 py-2">Продукт</th>
              <th className="px-4 py-2">Канал</th>
              <th className="px-4 py-2">Цена</th>
              <th className="px-4 py-2">Статус</th>
              <th className="px-4 py-2">До</th>
              <th className="px-4 py-2">Контакт</th>
              <th className="px-4 py-2">Действие</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-zinc-500">
                  Подписок пока нет
                </td>
              </tr>
            )}
            {subscriptions.map((sub) => (
              <tr key={sub.id} className="border-t border-black/5 dark:border-white/5">
                <td className="px-4 py-2 font-medium">{sub.business_name}</td>
                <td className="px-4 py-2">{products.find((p) => p.id === sub.product_id)?.title ?? sub.product_id}</td>
                <td className="px-4 py-2">
                  <ChannelBadge channel={sub.channel} />
                </td>
                <td className="px-4 py-2">{sub.price_kzt.toLocaleString("ru-RU")} ₸</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[sub.status] ?? ""}`}>
                    {STATUS_LABELS[sub.status] ?? sub.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("ru-RU") : "—"}
                </td>
                <td className="px-4 py-2">
                  {sub.contact_name}, {sub.contact_phone}
                </td>
                <td className="px-4 py-2">
                  {sub.status === "pending_payment" && <ConfirmSubscriptionPaymentButton subscriptionId={sub.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
