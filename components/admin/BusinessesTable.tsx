import type { BusinessRow } from "@/lib/db";
import CopyPitchButton from "./CopyPitchButton";
import ToggleBusinessViewedButton from "./ToggleBusinessViewedButton";

export default function BusinessesTable({ businesses, emptyHint }: { businesses: BusinessRow[]; emptyHint: string }) {
  return (
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
            <th className="px-4 py-2 font-medium">Просмотр</th>
          </tr>
        </thead>
        <tbody>
          {businesses.map((r) => (
            <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
              <td className="px-4 py-2">{r.name}</td>
              <td className="px-4 py-2">{r.industry}</td>
              <td className="px-4 py-2">{r.city}</td>
              <td className="px-4 py-2">
                <span className={r.qualified ? "font-medium text-emerald-600" : "text-zinc-500"}>{r.score}</span>
              </td>
              <td className="px-4 py-2">{r.whatsapp || "—"}</td>
              <td className="px-4 py-2">
                {r.card_url && (
                  <a href={r.card_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                    Открыть →
                  </a>
                )}
              </td>
              <td className="px-4 py-2">
                <CopyPitchButton pitch={r.pitch} />
              </td>
              <td className="px-4 py-2">
                <ToggleBusinessViewedButton businessId={r.id} viewed={r.viewed} />
              </td>
            </tr>
          ))}
          {businesses.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-zinc-500">
                {emptyHint}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
