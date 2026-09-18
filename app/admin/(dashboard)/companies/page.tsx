import { sql, type BusinessRow } from "@/lib/db";
import BusinessesTable from "@/components/admin/BusinessesTable";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesNewPage() {
  let businesses: BusinessRow[] = [];
  let dbError: string | null = null;

  if (sql) {
    try {
      businesses = (await sql`
        SELECT * FROM businesses WHERE viewed = false ORDER BY score DESC, created_at DESC
      `) as BusinessRow[];
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Неизвестная ошибка";
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Компании — новые ({businesses.length})</h1>
      <p className="mt-1 text-sm text-zinc-500">Найденные бизнесы, до которых вы ещё не добрались.</p>

      {dbError && (
        <p className="mt-6 rounded-xl bg-red-100 p-4 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-400">
          Ошибка чтения из базы: {dbError}
        </p>
      )}

      <BusinessesTable
        businesses={businesses}
        emptyHint="Пока пусто — запустите find-clients.mjs, затем score-leads.mjs --push"
      />
    </div>
  );
}
