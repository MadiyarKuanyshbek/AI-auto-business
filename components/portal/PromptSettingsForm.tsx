"use client";

import { useState, type FormEvent } from "react";

export default function PromptSettingsForm({ initialPrompt }: { initialPrompt: string | null }) {
  const [value, setValue] = useState(initialPrompt ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    try {
      const response = await fetch("/api/portal/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: value }),
      });
      if (!response.ok) throw new Error("failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="systemPrompt" className="block text-sm font-medium">
        Как бот должен отвечать клиентам
      </label>
      <textarea
        id="systemPrompt"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder="Например: Ты — администратор кофейни «Бодрость». Отвечай дружелюбно, коротко, предлагай оформить заказ на вынос. Меню и цены: ..."
        className="w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
      />
      <p className="text-xs text-muted">
        Пусто — используется стандартный текст. Изменения применяются сразу, без перезапуска бота.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {status === "saving" ? "Сохраняем..." : "Сохранить"}
        </button>
        {status === "saved" && <span className="text-sm text-emerald-500">Сохранено</span>}
        {status === "error" && <span className="text-sm text-red-400">Не удалось сохранить</span>}
      </div>
    </form>
  );
}
