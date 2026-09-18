"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isValidPhone } from "@/lib/phone";

type Step = "phone" | "code";
type Status = "idle" | "submitting" | "error";

export default function PortalLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidPhone(phone)) {
      setStatus("error");
      setError("Похоже, это не номер телефона. Укажите с кодом страны, например +7 700 000 00 00.");
      return;
    }

    setStatus("submitting");
    setError("");
    try {
      const response = await fetch("/api/portal/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error === "bot_offline" ? "bot_offline" : "request_failed");
      }
      setStatus("idle");
      setStep("code");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error && err.message === "bot_offline"
          ? "Бот сейчас не в сети, код отправить не удалось. Попробуйте чуть позже."
          : "Не получилось отправить код. Проверьте номер и попробуйте ещё раз.",
      );
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const response = await fetch("/api/portal/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, remember }),
      });
      if (!response.ok) throw new Error("invalid_code");
      router.push("/portal");
      router.refresh();
    } catch {
      setStatus("error");
      setError("Неверный или истёкший код. Проверьте WhatsApp — код приходит сообщением самому себе.");
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={handleCodeSubmit} className="space-y-4">
        <p className="text-sm text-muted">
          Мы отправили код в ваш WhatsApp — сообщением самому себе (найдите чат «Вы» / «Message Yourself»).
        </p>
        <div>
          <label htmlFor="code" className="block text-sm font-medium">
            Код из WhatsApp
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-center text-lg tracking-widest text-foreground outline-none focus:border-accent"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-accent"
          />
          Запомнить меня на этом устройстве (90 дней)
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {status === "submitting" ? "Проверяем..." : "Войти"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("phone");
            setCode("");
            setError("");
          }}
          className="w-full text-center text-xs text-muted hover:text-foreground"
        >
          ← Ввести другой номер
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handlePhoneSubmit} className="space-y-4">
      <div>
        <label htmlFor="phone" className="block text-sm font-medium">
          Номер WhatsApp, на который подключён бот
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          placeholder="+7 700 000 00 00"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {status === "submitting" ? "Отправляем код..." : "Получить код в WhatsApp"}
      </button>
    </form>
  );
}
