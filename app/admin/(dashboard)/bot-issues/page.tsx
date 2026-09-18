import { sql, type BotConfusionRow } from "@/lib/db";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  unclear_item: "Не нашёл позицию в меню",
  extraction_failed: "Не смог разобрать сообщение (сбой ИИ)",
  unsupported_type: "Неподдерживаемый тип сообщения",
  fallback: "Не понял, о чём сообщение",
};

const REASON_STYLES: Record<string, string> = {
  unclear_item: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  extraction_failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  unsupported_type: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  fallback: "bg-zinc-200 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400",
};

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

type Row = BotConfusionRow & { business_name: string };

export default async function BotIssuesPage() {
  let rows: Row[] = [];
  let dbError: string | null = null;
  let counts: { reason: string; count: number }[] = [];

  if (sql) {
    try {
      rows = (await sql`
        SELECT c.*, s.business_name
        FROM bot_confusion_log c
        JOIN subscriptions s ON s.id = c.subscription_id
        ORDER BY c.created_at DESC
        LIMIT 200
      `) as Row[];
      counts = (await sql`
        SELECT reason, COUNT(*)::int AS count
        FROM bot_confusion_log
        WHERE created_at > now() - interval '7 days'
        GROUP BY reason
        ORDER BY count DESC
      `) as { reason: string; count: number }[];
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Неизвестная ошибка";
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Что бот не понял ({rows.length})</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Журнал моментов, где бот не смог распознать заказ или сообщение клиента — не автопочинка, а данные для
        осознанного улучшения меню и промпта.
      </p>

      {dbError && (
        <p className="mt-4 rounded-lg bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-500/15 dark:text-red-400">
          Ошибка БД: {dbError}
        </p>
      )}

      {counts.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          {counts.map((c) => (
            <div
              key={c.reason}
              className="rounded-xl border border-black/10 bg-white/5 px-4 py-2 text-sm dark:border-white/10"
            >
              <span className="font-semibold">{c.count}</span> — {REASON_LABELS[c.reason] ?? c.reason} (7 дней)
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2">Когда</th>
              <th className="px-4 py-2">Бизнес</th>
              <th className="px-4 py-2">Причина</th>
              <th className="px-4 py-2">Что написал клиент</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                  Пока пусто — бот справляется
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-black/5 dark:border-white/5">
                <td className="px-4 py-2 whitespace-nowrap text-zinc-500">{formatDateTime(row.created_at)}</td>
                <td className="px-4 py-2 font-medium">{row.business_name}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${REASON_STYLES[row.reason] ?? ""}`}>
                    {REASON_LABELS[row.reason] ?? row.reason}
                  </span>
                </td>
                <td className="px-4 py-2 max-w-md">{row.message_text ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
