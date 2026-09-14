"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const STATUS_LABELS: Record<string, string> = {
  new: "Новая",
  contacted: "Написали",
  won: "Договорились",
  lost: "Отказ",
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  contacted: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  lost: "bg-zinc-200 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400",
};

export default function LeadStatusSelect({ leadId, status }: { leadId: number; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(status);

  async function handleChange(next: string) {
    setValue(next);
    await fetch(`/api/admin/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value)}
      className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[value] ?? ""}`}
    >
      {Object.entries(STATUS_LABELS).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
