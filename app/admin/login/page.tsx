"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const notConfigured = searchParams.get("error") === "not_configured";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError(response.status === 401 ? "Неверный пароль." : "Что-то пошло не так.");
        setLoading(false);
        return;
      }

      const next = searchParams.get("next") || "/admin";
      router.push(next);
      router.refresh();
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Вход в админку</h1>
          <Link
            href="/"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            ← На сайт
          </Link>
        </div>

        {notConfigured && (
          <p className="mt-3 rounded-lg bg-amber-100 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
            ADMIN_PASSWORD не задан на сервере — см. docs/ADMIN_SETUP.md.
          </p>
        )}

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Пароль"
          autoFocus
          className="mt-6 w-full rounded-lg border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-indigo-600 dark:border-white/15 dark:bg-white/5"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? "Проверяем..." : "Войти"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
