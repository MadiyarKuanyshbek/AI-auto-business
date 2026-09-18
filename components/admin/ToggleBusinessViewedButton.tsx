"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function ToggleBusinessViewedButton({
  businessId,
  viewed,
}: {
  businessId: number;
  viewed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await fetch(`/api/admin/businesses/${businessId}/viewed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewed: !viewed }),
      });
      startTransition(() => router.refresh());
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || pending}
      className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/10 disabled:opacity-60 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/20"
    >
      {loading || pending ? "..." : viewed ? "Вернуть в новые" : "Отметить просмотренным"}
    </button>
  );
}
