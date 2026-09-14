import Link from "next/link";
import { sql, type BusinessRow, type GroupLeadRow, type LeadRow } from "@/lib/db";
import LogoutButton from "@/components/admin/LogoutButton";
import CopyPitchButton from "@/components/admin/CopyPitchButton";
import LeadStatusSelect from "@/components/admin/LeadStatusSelect";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const configured = Boolean(sql);

  let leads: LeadRow[] = [];
  let businesses: BusinessRow[] = [];
  let groupLeads: GroupLeadRow[] = [];
  let dbError: string | null = null;

  if (configured && sql) {
    try {
      const [leadRows, businessRows, groupLeadRows] = await Promise.all([
        sql`SELECT * FROM leads ORDER BY created_at DESC`,
        sql`SELECT * FROM businesses ORDER BY score DESC, created_at DESC`,
        sql`SELECT * FROM group_leads ORDER BY created_at DESC LIMIT 200`,
      ]);
      leads = leadRows as LeadRow[];
      businesses = businessRows as BusinessRow[];
      groupLeads = groupLeadRows as GroupLeadRow[];
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Неизвестная ошибка";
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Админка</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              ← На сайт
            </Link>
            <LogoutButton />
          </div>
        </div>

        {!configured && (
          <p className="mt-6 rounded-xl bg-amber-100 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
            База данных не настроена — заявкам и найденным бизнесам негде храниться. Проверьте
            DATABASE_URL — см. docs/ADMIN_SETUP.md.
          </p>
        )}
        {dbError && (
          <p className="mt-6 rounded-xl bg-red-100 p-4 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-400">
            Ошибка чтения из базы: {dbError}. Если таблиц ещё нет — запустите{" "}
            <code>node scripts/init-db.mjs</code>.
          </p>
        )}

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
                    <td className="px-4 py-2 text-zinc-500">
                      {new Date(r.created_at).toLocaleString("ru-RU")}
                    </td>
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

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Найденные бизнесы ({businesses.length})</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="px-4 py-2 font-medium">Название</th>
                  <th className="px-4 py-2 font-medium">Отрасль</th>
                  <th className="px-4 py-2 font-medium">Город</th>
                  <th className="px-4 py-2 font-medium">Балл</th>
                  <th className="px-4 py-2 font-medium">WhatsApp</th>
                  <th className="px-4 py-2 font-medium">Карточка</th>
                  <th className="px-4 py-2 font-medium">Предложение</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((r) => (
                  <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2">{r.industry}</td>
                    <td className="px-4 py-2">{r.city}</td>
                    <td className="px-4 py-2">
                      <span
                        className={r.qualified ? "font-medium text-emerald-600" : "text-zinc-500"}
                      >
                        {r.score}
                      </span>
                    </td>
                    <td className="px-4 py-2">{r.whatsapp || "—"}</td>
                    <td className="px-4 py-2">
                      {r.card_url && (
                        <a
                          href={r.card_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          Открыть →
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <CopyPitchButton pitch={r.pitch} />
                    </td>
                  </tr>
                ))}
                {businesses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
                      Пока пусто — запустите find-clients.mjs, затем score-leads.mjs --push
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Заказы из Telegram-групп ({groupLeads.length})</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Бот сам ничего не пишет — только замечает похожие на заказ посты в группах, куда его добавили, и готовит черновик. Отправка — вручную.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="px-4 py-2 font-medium">Группа</th>
                  <th className="px-4 py-2 font-medium">Ниша</th>
                  <th className="px-4 py-2 font-medium">Автор</th>
                  <th className="px-4 py-2 font-medium">Сообщение</th>
                  <th className="px-4 py-2 font-medium">Когда</th>
                  <th className="px-4 py-2 font-medium">Предложение</th>
                </tr>
              </thead>
              <tbody>
                {groupLeads.map((r) => (
                  <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-4 py-2">{r.chat_title || r.chat_id}</td>
                    <td className="px-4 py-2">{r.business_label || "—"}</td>
                    <td className="px-4 py-2">
                      {r.sender_name || "?"} {r.sender_username || ""}
                    </td>
                    <td className="max-w-xs px-4 py-2">
                      <p className="line-clamp-2 text-zinc-600 dark:text-zinc-400" title={r.message_text ?? ""}>
                        {r.message_text}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-zinc-500">
                      {new Date(r.created_at).toLocaleString("ru-RU")}
                    </td>
                    <td className="px-4 py-2">
                      <CopyPitchButton pitch={r.pitch} />
                    </td>
                  </tr>
                ))}
                {groupLeads.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                      Пока пусто — добавьте бота в группу (см. docs/GROUP_MONITORING_SETUP.md)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
