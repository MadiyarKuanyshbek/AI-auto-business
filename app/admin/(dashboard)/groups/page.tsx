import { sql, type GroupLeadRow } from "@/lib/db";
import CopyPitchButton from "@/components/admin/CopyPitchButton";

export const dynamic = "force-dynamic";

export default async function AdminGroupsPage() {
  let groupLeads: GroupLeadRow[] = [];
  let dbError: string | null = null;

  if (sql) {
    try {
      groupLeads = (await sql`SELECT * FROM group_leads ORDER BY created_at DESC LIMIT 200`) as GroupLeadRow[];
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Неизвестная ошибка";
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Заказы из Telegram-групп ({groupLeads.length})</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Бот сам ничего не пишет — только замечает похожие на заказ посты в группах, куда его добавили, и готовит
        черновик. Отправка — вручную.
      </p>

      {dbError && (
        <p className="mt-6 rounded-xl bg-red-100 p-4 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-400">
          Ошибка чтения из базы: {dbError}
        </p>
      )}

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
                <td className="px-4 py-2 text-zinc-500">{new Date(r.created_at).toLocaleString("ru-RU")}</td>
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
    </div>
  );
}
