"use client";

import { useState, type FormEvent } from "react";

export default function PromptSettingsForm({
  initialPrompt,
  initialOpensAt,
  initialClosesAt,
}: {
  initialPrompt: string | null;
  initialOpensAt: string;
  initialClosesAt: string;
}) {
  const [value, setValue] = useState(initialPrompt ?? "");
  const [opensAt, setOpensAt] = useState(initialOpensAt);
  const [closesAt, setClosesAt] = useState(initialClosesAt);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    try {
      const response = await fetch("/api/portal/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: value, opensAt: opensAt || null, closesAt: closesAt || null }),
      });
      if (!response.ok) throw new Error("failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
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
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium">Часы работы (по времени Алматы)</label>
        <div className="flex items-center gap-3">
          <input
            type="time"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
            className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          <span className="text-sm text-muted">—</span>
          <input
            type="time"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          {(opensAt || closesAt) && (
            <button
              type="button"
              onClick={() => {
                setOpensAt("");
                setClosesAt("");
              }}
              className="text-xs text-muted hover:text-foreground"
            >
              Сбросить
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          Пусто — бот принимает заказы круглосуточно. Если заданы оба поля, вне этих часов бот предупредит клиента,
          что сейчас закрыто (но заказ всё равно примет — на потом).
        </p>
      </div>

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
