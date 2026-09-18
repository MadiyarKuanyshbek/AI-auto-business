import { sql, type LeadRow, type SubscriptionRow } from "@/lib/db";
import { products } from "@/lib/products";
import LeadStatusSelect from "@/components/admin/LeadStatusSelect";
import ChannelBadge from "@/components/admin/ChannelBadge";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  active: "Активна",
  expired: "Истекла",
  cancelled: "Отменена",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  expired: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  cancelled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400",
};

export default async function AdminAcceptedPage() {
  let leads: LeadRow[] = [];
  let subscriptions: SubscriptionRow[] = [];
  let dbError: string | null = null;

  if (sql) {
    try {
      const [leadRows, subRows] = await Promise.all([
        sql`SELECT * FROM leads WHERE status IN ('contacted', 'won', 'lost') ORDER BY created_at DESC`,
        sql`SELECT * FROM subscriptions WHERE status IN ('active', 'expired', 'cancelled') ORDER BY created_at DESC`,
      ]);
      leads = leadRows as LeadRow[];
      subscriptions = subRows as SubscriptionRow[];
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Неизвестная ошибка";
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Принятые заявки</h1>
      <p className="mt-1 text-sm text-zinc-500">Уже разобрано — заявки, на которые вы отреагировали, и подписки с решённым статусом оплаты.</p>

      {dbError && (
        <p className="mt-6 rounded-xl bg-red-100 p-4 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-400">
          Ошибка чтения из базы: {dbError}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Подписки ({subscriptions.length})</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-4 py-2 font-medium">Бизнес</th>
                <th className="px-4 py-2 font-medium">Продукт</th>
                <th className="px-4 py-2 font-medium">Канал</th>
                <th className="px-4 py-2 font-medium">Статус</th>
                <th className="px-4 py-2 font-medium">До</th>
                <th className="px-4 py-2 font-medium">Контакт</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2">{sub.business_name}</td>
                  <td className="px-4 py-2">
                    {products.find((p) => p.id === sub.product_id)?.title ?? sub.product_id}
                  </td>
                  <td className="px-4 py-2">
                    <ChannelBadge channel={sub.channel} />
                  </td>
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
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                    Пока пусто
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Заявки ({leads.length})</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-4 py-2 font-medium">Имя</th>
                <th className="px-4 py-2 font-medium">Контакт</th>
                <th className="px-4 py-2 font-medium">Ниша</th>
                <th className="px-4 py-2 font-medium">Комментарий</th>
                <th className="px-4 py-2 font-medium">Статус</th>
                <th className="px-4 py-2 font-medium">Когда</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((r) => (
                <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2">{r.contact}</td>
                  <td className="px-4 py-2">{r.niche}</td>
                  <td className="px-4 py-2">{r.comment}</td>
                  <td className="px-4 py-2">
                    <LeadStatusSelect leadId={r.id} status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{new Date(r.created_at).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                    Пока пусто
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
