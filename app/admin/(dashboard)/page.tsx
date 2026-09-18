import { sql, type LeadRow, type SubscriptionRow } from "@/lib/db";
import { products } from "@/lib/products";
import LeadStatusSelect from "@/components/admin/LeadStatusSelect";
import ConfirmSubscriptionPaymentButton from "@/components/admin/ConfirmSubscriptionPaymentButton";
import ChannelBadge from "@/components/admin/ChannelBadge";

export const dynamic = "force-dynamic";

export default async function AdminInboxPage() {
  const configured = Boolean(sql);

  let leads: LeadRow[] = [];
  let pendingSubscriptions: SubscriptionRow[] = [];
  let dbError: string | null = null;

  if (configured && sql) {
    try {
      const [leadRows, subRows] = await Promise.all([
        sql`SELECT * FROM leads WHERE status = 'new' ORDER BY created_at DESC`,
        sql`SELECT * FROM subscriptions WHERE status = 'pending_payment' ORDER BY created_at DESC`,
      ]);
      leads = leadRows as LeadRow[];
      pendingSubscriptions = subRows as SubscriptionRow[];
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Неизвестная ошибка";
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Непринятые заявки</h1>
      <p className="mt-1 text-sm text-zinc-500">Новые заявки и подписки, которые ждут вашего решения.</p>

      {!configured && (
        <p className="mt-6 rounded-xl bg-amber-100 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
          База данных не настроена — заявкам негде храниться. Проверьте DATABASE_URL.
        </p>
      )}
      {dbError && (
        <p className="mt-6 rounded-xl bg-red-100 p-4 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-400">
          Ошибка чтения из базы: {dbError}. Если таблиц ещё нет — запустите <code>node scripts/init-db.mjs</code>.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Подписки, ждущие подтверждения оплаты ({pendingSubscriptions.length})</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-4 py-2 font-medium">Бизнес</th>
                <th className="px-4 py-2 font-medium">Продукт</th>
                <th className="px-4 py-2 font-medium">Канал</th>
                <th className="px-4 py-2 font-medium">Цена</th>
                <th className="px-4 py-2 font-medium">Контакт</th>
                <th className="px-4 py-2 font-medium">Действие</th>
              </tr>
            </thead>
            <tbody>
              {pendingSubscriptions.map((sub) => (
                <tr key={sub.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2">{sub.business_name}</td>
                  <td className="px-4 py-2">
                    {products.find((p) => p.id === sub.product_id)?.title ?? sub.product_id}
                  </td>
                  <td className="px-4 py-2">
                    <ChannelBadge channel={sub.channel} />
                  </td>
                  <td className="px-4 py-2">{sub.price_kzt.toLocaleString("ru-RU")} ₸</td>
                  <td className="px-4 py-2">
                    {sub.contact_name}, {sub.contact_phone}
                  </td>
                  <td className="px-4 py-2">
                    <ConfirmSubscriptionPaymentButton subscriptionId={sub.id} />
                  </td>
                </tr>
              ))}
              {pendingSubscriptions.length === 0 && (
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
                <th className="px-4 py-2 font-medium">Откуда</th>
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
                    <span
                      className={
                        r.source === "telegram"
                          ? "rounded-full bg-[#26A5E4]/15 px-2 py-0.5 text-xs font-medium text-[#26A5E4]"
                          : "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400"
                      }
                    >
                      {r.source === "telegram" ? "Telegram" : "Сайт"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <LeadStatusSelect leadId={r.id} status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{new Date(r.created_at).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
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
