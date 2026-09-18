"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isValidPhone } from "@/lib/phone";

type Status = "idle" | "submitting" | "error";
type Channel = "whatsapp" | "telegram";

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
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const businessName = (form.elements.namedItem("businessName") as HTMLInputElement).value.trim();
    const contactName = (form.elements.namedItem("contactName") as HTMLInputElement).value.trim();
    const contactPhone = (form.elements.namedItem("contactPhone") as HTMLInputElement).value.trim();
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
    if (portalPassword.length < 4) {
      setStatus("error");
      setErrorMessage("Пароль для личного кабинета — минимум 4 символа.");
      return;
    }

    let payload: Record<string, unknown>;
    let endpoint: string;

    if (channel === "whatsapp") {
      const contactTelegram = (form.elements.namedItem("contactTelegram") as HTMLInputElement).value.trim();
      payload = {
        productId,
        businessSlug,
        businessName,
        contactName,
        contactPhone,
        contactTelegram: contactTelegram || undefined,
        portalPassword,
      };
      endpoint = "/api/subscriptions";
    } else {
      const botToken = (form.elements.namedItem("botToken") as HTMLInputElement).value.trim();
      if (!botToken) {
        setStatus("error");
        setErrorMessage("Вставьте токен бота, который дал @BotFather.");
        return;
      }
      payload = { productId, businessSlug, businessName, contactName, contactPhone, botToken, portalPassword };
      endpoint = "/api/subscriptions/telegram";
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error === "invalid_bot_token" ? "invalid_bot_token" : "request_failed");
      }

      const { id } = await response.json();
      router.push(channel === "whatsapp" ? `/subscriptions/${id}/pay` : `/subscriptions/${id}/status`);
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error && err.message === "invalid_bot_token"
          ? "Токен не сработал — проверьте, что скопировали его целиком из @BotFather."
          : "Не получилось отправить заявку. Попробуйте ещё раз чуть позже.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-full border border-border bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setChannel("whatsapp")}
          className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
            channel === "whatsapp" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          WhatsApp · {price.toLocaleString("ru-RU")} ₸/мес
        </button>
        <button
          type="button"
          onClick={() => setChannel("telegram")}
          className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
            channel === "telegram" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          Telegram · бесплатно
        </button>
      </div>
      <p className="text-xs text-muted">
        {channel === "whatsapp"
          ? "Бот работает 24/7, пока подписка активна. Оплата — переводом на Kaspi, подтверждаем вручную."
          : "Telegram-бот не требует постоянного сервера — подключается сразу и бесплатно."}
      </p>

      <div>
        <label htmlFor="businessName" className="block text-sm font-medium">
          Название бизнеса
        </label>
        <input
          id="businessName"
          name="businessName"
          type="text"
          required
          className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="contactName" className="block text-sm font-medium">
          Ваше имя
        </label>
        <input
          id="contactName"
          name="contactName"
          type="text"
          required
          className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="contactPhone" className="block text-sm font-medium">
          {channel === "whatsapp" ? "Номер WhatsApp бизнеса (на него подключим бота)" : "Ваш телефон для связи"}
        </label>
        <input
          id="contactPhone"
          name="contactPhone"
          type="tel"
          inputMode="tel"
          placeholder="+7 700 000 00 00"
          required
          className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
        />
        {channel === "whatsapp" && (
          <p className="mt-1 text-xs text-muted">
            Это рабочий номер, на котором бот будет отвечать клиентам — не обязательно тот, с которого вы заходите на сайт.
          </p>
        )}
      </div>

      {channel === "whatsapp" ? (
        <div>
          <label htmlFor="contactTelegram" className="block text-sm font-medium">
            Telegram (необязательно)
          </label>
          <input
            id="contactTelegram"
            name="contactTelegram"
            type="text"
            placeholder="@username"
            className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
      ) : (
        <div>
          <label htmlFor="botToken" className="block text-sm font-medium">
            Токен Telegram-бота
          </label>
          <input
            id="botToken"
            name="botToken"
            type="text"
            placeholder="123456789:AAExampleTokenFromBotFather"
            required
            className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
          />
          <p className="mt-1 text-xs text-muted">
            Как получить: в Telegram откройте @BotFather → <code>/newbot</code> → придумайте имя → скопируйте
            токен, который он пришлёт, и вставьте сюда.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="portalPassword" className="block text-sm font-medium">
          Пароль для личного кабинета
        </label>
        <input
          id="portalPassword"
          name="portalPassword"
          type="password"
          minLength={4}
          required
          className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-muted">
          Вход по номеру телефона + этот пароль — работает сразу, без ожидания кода в мессенджере.
        </p>
      </div>

      {status === "error" && <p className="text-sm text-red-400">{errorMessage}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {status === "submitting" ? "Оформляем..." : channel === "whatsapp" ? "Оформить подписку" : "Подключить бесплатно"}
      </button>
    </form>
  );
}
