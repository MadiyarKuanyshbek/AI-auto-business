"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isValidPhone } from "@/lib/phone";

type Status = "idle" | "submitting" | "error";

const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent";

export default function SubscriptionRegisterForm({
  productId,
  businessSlug,
  price,
}: {
  productId: string;
  businessSlug?: string;
  price: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value.trim();
    const businessName = value("businessName");
    const contactName = value("contactName");
    const contactPhone = value("contactPhone");
    const botToken = value("botToken");
    const portalPassword = (form.elements.namedItem("portalPassword") as HTMLInputElement).value;

    if (!businessName || !contactName || !contactPhone) {
      setStatus("error");
      setErrorMessage("Заполните название бизнеса, имя и телефон.");
      return;
    }
    if (!isValidPhone(contactPhone)) {
      setStatus("error");
      setErrorMessage("Похоже, это не номер телефона. Укажите с кодом страны, например +7 700 000 00 00.");
      return;
    }
    if (!botToken) {
      setStatus("error");
      setErrorMessage("Вставьте токен бота, который дал @BotFather (инструкция выше).");
      return;
    }
    if (portalPassword.length < 4) {
      setStatus("error");
      setErrorMessage("Пароль для личного кабинета — минимум 4 символа.");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/subscriptions/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, businessSlug, businessName, contactName, contactPhone, botToken, portalPassword }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error === "invalid_bot_token" ? "invalid_bot_token" : "request_failed");
      }

      // Сервер уже вошёл в личный кабинет за клиента — сразу ведём в мастер настройки.
      router.push("/portal/setup");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error && err.message === "invalid_bot_token"
          ? "Токен не сработал: проверьте, что скопировали его целиком из @BotFather."
          : "Не получилось подключить. Попробуйте ещё раз чуть позже.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4 text-sm">
        <p className="font-semibold">7 дней бесплатно, карта не нужна</p>
        <p className="mt-1 text-muted">
          Потом {price.toLocaleString("ru-RU")} ₸/мес переводом на Kaspi. Откажетесь, и бот просто остановится.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white/5 p-4 text-sm">
        <p className="font-semibold">Как получить токен бота (2 минуты)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>
            Откройте{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-accent underline">
              @BotFather
            </a>{" "}
            в Telegram и нажмите «Запустить».
          </li>
          <li>
            Отправьте <code>/newbot</code>, придумайте имя бота (любое) и адрес, оканчивающийся на <code>bot</code>.
          </li>
          <li>BotFather пришлёт длинный токен, скопируйте его и вставьте в поле ниже.</li>
        </ol>
        <p className="mt-2 text-muted">
          Не хотите разбираться?{" "}
          <Link href="/#lead-form" className="text-accent underline">
            Мы подключим за вас
          </Link>{" "}
          (30 000 ₸ разово).
        </p>
      </div>

      <div>
        <label htmlFor="botToken" className="block text-sm font-medium">
          Токен бота от @BotFather
        </label>
        <input
          id="botToken"
          name="botToken"
          type="text"
          autoComplete="off"
          placeholder="123456789:AAExampleTokenFromBotFather"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="businessName" className="block text-sm font-medium">
          Название бизнеса
        </label>
        <input id="businessName" name="businessName" type="text" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="contactName" className="block text-sm font-medium">
          Ваше имя
        </label>
        <input id="contactName" name="contactName" type="text" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="contactPhone" className="block text-sm font-medium">
          Ваш телефон
        </label>
        <input
          id="contactPhone"
          name="contactPhone"
          type="tel"
          inputMode="tel"
          placeholder="+7 700 000 00 00"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="portalPassword" className="block text-sm font-medium">
          Придумайте пароль для личного кабинета
        </label>
        <input id="portalPassword" name="portalPassword" type="password" minLength={4} required className={inputClass} />
        <p className="mt-1 text-xs text-muted">Вход: номер телефона + этот пароль.</p>
      </div>

      {status === "error" && <p className="text-sm text-red-400">{errorMessage}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {status === "submitting" ? "Подключаем..." : "Подключить бота бесплатно"}
      </button>
    </form>
  );
}
