"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isValidPhone } from "@/lib/phone";

type Status = "idle" | "submitting" | "error";

export default function SubscriptionRegisterForm({
  productId,
  businessSlug,
}: {
  productId: string;
  businessSlug?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = {
      productId,
      businessSlug,
      businessName: (form.elements.namedItem("businessName") as HTMLInputElement).value.trim(),
      contactName: (form.elements.namedItem("contactName") as HTMLInputElement).value.trim(),
      contactPhone: (form.elements.namedItem("contactPhone") as HTMLInputElement).value.trim(),
      contactTelegram: (form.elements.namedItem("contactTelegram") as HTMLInputElement).value.trim() || undefined,
    };

    if (!data.businessName || !data.contactName || !data.contactPhone) {
      setStatus("error");
      setErrorMessage("Заполните название бизнеса, имя и WhatsApp-номер.");
      return;
    }

    if (!isValidPhone(data.contactPhone)) {
      setStatus("error");
      setErrorMessage("Похоже, это не номер телефона. Укажите с кодом страны, например +7 700 000 00 00.");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("request_failed");

      const { id } = await response.json();
      router.push(`/subscriptions/${id}/pay`);
    } catch {
      setStatus("error");
      setErrorMessage("Не получилось отправить заявку. Попробуйте ещё раз чуть позже.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          Номер WhatsApp бизнеса (на него подключим бота)
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
        <p className="mt-1 text-xs text-muted">
          Это рабочий номер, на котором бот будет отвечать клиентам — не обязательно тот, с которого вы заходите на сайт.
        </p>
      </div>
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

      {status === "error" && <p className="text-sm text-red-400">{errorMessage}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {status === "submitting" ? "Оформляем..." : "Оформить подписку"}
      </button>
    </form>
  );
}
