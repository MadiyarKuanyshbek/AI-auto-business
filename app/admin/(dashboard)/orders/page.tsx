import { sql, type OrderItem, type TelegramOrderRow } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATE_LABELS: Record<string, string> = {
  collecting: "Собирает заказ",
  delivery: "Выбирает доставку",
  address: "Вводит адрес",
  confirm: "Подтверждает",
  payment: "Ждём оплату",
  sent: "Ждёт готовности",
  ready: "Готов",
  cancelled: "Отменён",
};

const STATE_STYLES: Record<string, string> = {
  collecting: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  delivery: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  address: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  confirm: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  payment: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  cancelled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400",
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

type OrderRow = TelegramOrderRow & { business_name: string };

export default async function AdminOrdersPage() {
  let orders: OrderRow[] = [];
  let dbError: string | null = null;

  if (sql) {
    try {
      orders = (await sql`
        SELECT o.*, s.business_name
        FROM telegram_orders o
        JOIN subscriptions s ON s.id = o.subscription_id
        ORDER BY o.created_at DESC
        LIMIT 200
      `) as OrderRow[];
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Неизвестная ошибка";
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Заказы через Telegram-ботов ({orders.length})</h1>
      <p className="mt-1 text-sm text-zinc-500">Последние 200 заказов по всем клиентам, включая незавершённые.</p>

      {dbError && (
        <p className="mt-4 rounded-lg bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-500/15 dark:text-red-400">
          Ошибка БД: {dbError}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2">Когда</th>
              <th className="px-4 py-2">Бизнес</th>
              <th className="px-4 py-2">Клиент</th>
              <th className="px-4 py-2">Позиции</th>
              <th className="px-4 py-2">Доставка</th>
              <th className="px-4 py-2">Сумма</th>
              <th className="px-4 py-2">Статус</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
                  Заказов пока нет
                </td>
              </tr>
            )}
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-black/5 dark:border-white/5">
                <td className="px-4 py-2 whitespace-nowrap text-zinc-500">{formatDateTime(order.created_at)}</td>
                <td className="px-4 py-2 font-medium">{order.business_name}</td>
                <td className="px-4 py-2">{order.customer_name ?? `чат ${order.customer_chat_id}`}</td>
                <td className="px-4 py-2 max-w-xs">{formatItems(order.items)}</td>
                <td className="px-4 py-2">
                  {order.delivery_type === "delivery" ? `Доставка: ${order.address ?? "—"}` : order.delivery_type === "pickup" ? "Самовывоз" : "—"}
                </td>
                <td className="px-4 py-2">{order.total_kzt ? `${order.total_kzt.toLocaleString("ru-RU")} ₸` : "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATE_STYLES[order.state] ?? ""}`}>
                    {STATE_LABELS[order.state] ?? order.state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
