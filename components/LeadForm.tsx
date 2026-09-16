"use client";

import { useState, type FormEvent } from "react";
import { track } from "@vercel/analytics";
import { isValidPhone } from "@/lib/phone";
import { getNicheGroups, OTHER_NICHE_LABEL, OTHER_NICHE_SLUG } from "@/lib/products";

type Status = "idle" | "submitting" | "success" | "error";
type Intent = "inquiry" | "purchase";
type Plan = "setup" | "subscription";

const nicheGroups = getNicheGroups();

export default function LeadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [intent, setIntent] = useState<Intent>("inquiry");
  const [plan, setPlan] = useState<Plan>("setup");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    const form = event.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value.trim(),
      contact: (form.elements.namedItem("contact") as HTMLInputElement).value.trim(),
      niche: (form.elements.namedItem("niche") as HTMLSelectElement).value,
      comment: (form.elements.namedItem("comment") as HTMLTextAreaElement).value.trim(),
      intent,
      plan: intent === "purchase" ? plan : undefined,
    };

    if (!data.name || !data.contact) {
      setStatus("error");
      setErrorMessage("Заполните имя и номер WhatsApp.");
      return;
    }

    if (!isValidPhone(data.contact)) {
      setStatus("error");
      setErrorMessage(
        "Похоже, это не похоже на номер телефона. Укажите его с кодом страны, например +7 700 000 00 00.",
      );
      return;
    }

    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("request_failed");
      }

      setStatus("success");
      track("lead_submitted", { niche: data.niche, intent });
      form.reset();
      setIntent("inquiry");
      setPlan("setup");
    } catch {
      setStatus("error");
      setErrorMessage("Не получилось отправить заявку. Попробуйте ещё раз чуть позже.");
      track("lead_submit_failed");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-8 text-center">
        <h3 className="text-xl font-semibold">
          {intent === "purchase" ? "Заявка на оформление отправлена!" : "Заявка отправлена!"}
        </h3>
        <p className="mt-2 text-sm text-muted">
          {intent === "purchase"
            ? "Мы свяжемся с вами и пришлём реквизиты для оплаты через Kaspi в течение часа."
            : "Мы свяжемся с вами в течение рабочего дня."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-full border border-border bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setIntent("inquiry")}
          className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
            intent === "inquiry"
              ? "bg-accent text-accent-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          💬 Узнать подробнее
        </button>
        <button
          type="button"
          onClick={() => setIntent("purchase")}
          className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
            intent === "purchase"
              ? "bg-accent text-accent-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          🛒 Готов оформить
        </button>
      </div>

      {intent === "purchase" && (
        <div>
          <label htmlFor="plan" className="block text-sm font-medium">
            Что оформляем
          </label>
          <select
            id="plan"
            name="plan"
            value={plan}
            onChange={(event) => setPlan(event.target.value as Plan)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="setup" className="bg-surface text-foreground">
              Разовая настройка
            </option>
            <option value="subscription" className="bg-surface text-foreground">
              Ежемесячная подписка
            </option>
          </select>
          <p className="mt-1 text-xs text-muted">
            Точную сумму и реквизиты Kaspi пришлём в переписке — стоимость зависит от сложности.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Имя
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="contact" className="block text-sm font-medium">
          Номер WhatsApp
        </label>
        <input
          id="contact"
          name="contact"
          type="tel"
          inputMode="tel"
          placeholder="+7 700 000 00 00"
          required
          className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-muted">
          Мы напишем вам в WhatsApp по этому номеру, а не позвоним.
        </p>
      </div>
      <div>
        <label htmlFor="niche" className="block text-sm font-medium">
          Сфера бизнеса
        </label>
        <select
          id="niche"
          name="niche"
          defaultValue="auto"
          className="mt-1 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
        >
          {nicheGroups.map((group) => (
            <optgroup key={group.category} label={group.category}>
              {group.businesses.map((business) => (
                <option key={business.slug} value={business.slug} className="bg-surface text-foreground">
                  {business.icon} {business.label}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={OTHER_NICHE_SLUG} className="bg-surface text-foreground">
            {OTHER_NICHE_LABEL}
          </option>
        </select>
      </div>
      <div>
        <label htmlFor="comment" className="block text-sm font-medium">
          Комментарий (необязательно)
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-white/5 px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>

      {status === "error" && (
        <p className="text-sm text-red-400">{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {status === "submitting"
          ? "Отправляем..."
          : intent === "purchase"
            ? "Оформить и получить реквизиты"
            : "Отправить заявку"}
      </button>
    </form>
  );
}
