"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// "Разовая оплата навсегда" — на деле означает предоплату хостинга на много
// месяцев вперёд (иначе бот работает на реальном сервере, который стоит
// денег каждый месяц). Выбираете срок при подтверждении — техническая
// разница с обычной подпиской только в том, на сколько продлевается период.
const PERIOD_OPTIONS = [
  { months: 1, label: "1 месяц" },
  { months: 12, label: "1 год" },
  { months: 60, label: "5 лет (по факту навсегда)" },
  { months: 120, label: "10 лет" },
];

const ERROR_MESSAGES: Record<string, string> = {
  daemon_unreachable:
    "WhatsApp-демон недоступен — подписку нельзя активировать без него (VPS ещё не поднят). Это ожидаемо, пока WhatsApp не подключён.",
  not_pending: "Эта подписка уже не ждёт оплаты — обновите страницу.",
  not_found: "Подписка не найдена.",
};

export default function ConfirmSubscriptionPaymentButton({ subscriptionId }: { subscriptionId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [months, setMonths] = useState(1);

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/subscriptions/${subscriptionId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodMonths: months }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const code = body.error ?? "request_failed";
        throw new Error(ERROR_MESSAGES[code] ?? `Не получилось (${code})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={months}
        onChange={(e) => setMonths(Number(e.target.value))}
        className="rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-xs dark:border-white/10"
      >
        {PERIOD_OPTIONS.map((opt) => (
          <option key={opt.months} value={opt.months} className="bg-white text-black dark:bg-zinc-900 dark:text-white">
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || pending}
        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        {loading || pending ? "..." : "Подтвердить оплату"}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
