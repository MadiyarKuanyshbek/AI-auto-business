"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarkPaidButton({ subscriptionId }: { subscriptionId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/mark-paid`, { method: "POST" });
      if (!response.ok) throw new Error("request_failed");
      router.push(`/subscriptions/${subscriptionId}/status`);
    } catch {
      setPending(false);
      setError("Не получилось отправить. Попробуйте ещё раз.");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? "Отправляем..." : "Я оплатил"}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
