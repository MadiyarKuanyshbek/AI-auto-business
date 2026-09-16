"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { getDemoConfig, type Business, type Product, type ResolvedDemoConfig } from "@/lib/products";
import { SITE_URL } from "@/lib/siteUrl";
import TelegramButton from "./TelegramButton";
import WhatsAppButton from "./WhatsAppButton";

type Message = { role: "bot" | "user"; text: string };

const TYPING_DELAY_MS = 450;

function matchAnswer(config: ResolvedDemoConfig, input: string): string {
  const normalized = input.toLowerCase();
  for (const rule of config.rules) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.answer;
    }
  }
  return config.fallback;
}

export default function ProductDemoModal({
  product,
  business,
  onClose,
}: {
  product: Product;
  business: Business;
  onClose: () => void;
}) {
  const demoConfig = getDemoConfig(product, business);
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", text: demoConfig.greeting },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const demoUrl = `${SITE_URL}/demo/${product.id}/${business.slug}`;

  async function copyDemoLink() {
    try {
      await navigator.clipboard.writeText(demoUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      window.prompt("Скопируйте ссылку:", demoUrl);
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isTyping) return;

    const answer = matchAnswer(demoConfig, text);
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "bot", text: answer }]);
      setIsTyping(false);
    }, TYPING_DELAY_MS);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Демо · {business.icon} {business.label}
            </p>
            <h3 className="mt-1 font-display text-lg font-bold">{product.objectName}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-full p-1 text-muted transition-colors hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <div className="border-b border-border p-4">
          <p className="mb-3 text-xs font-medium text-muted">
            Как это устроено «под капотом»:
          </p>
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-1">
            {product.flow.map((step, index) => (
              <div key={step.title} className="flex items-center gap-1">
                <div className="flex w-24 flex-shrink-0 flex-col items-center gap-1 text-center">
                  <span className="text-xl">{step.icon}</span>
                  <span className="text-[10px] leading-tight text-muted">
                    {step.title}
                  </span>
                </div>
                {index < product.flow.length - 1 && (
                  <span className="flex-shrink-0 text-muted">→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-accent text-accent-foreground"
                    : "bg-white/10 text-foreground"
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl bg-white/10 px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-border p-4">
          <p className="mb-2 text-xs text-muted">{demoConfig.hint}</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Напишите сообщение..."
              disabled={isTyping}
              className="flex-1 rounded-full border border-border bg-white/5 px-4 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isTyping}
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
            >
              →
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-2 border-t border-border p-4">
          <div className="flex gap-2">
            <Link
              href={`/demo/${product.id}/${business.slug}`}
              target="_blank"
              className="flex-1 rounded-full border border-accent/40 bg-accent/10 px-4 py-2.5 text-center text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              🎬 Смотреть анимацию
            </Link>
            <button
              type="button"
              onClick={copyDemoLink}
              className="flex-1 rounded-full border border-border bg-white/5 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/10"
            >
              {linkCopied ? "✅ Скопировано" : "🔗 Ссылка для клиента"}
            </button>
          </div>
          <TelegramButton className="w-full py-2.5">
            Обсудить в Telegram
          </TelegramButton>
          <WhatsAppButton
            message={`Здравствуйте! Хочу такой же пакет: «${product.title}» для «${business.label}».`}
            className="w-full py-2.5"
          />
          <a
            href="#lead-form"
            onClick={onClose}
            className="block rounded-full border border-border bg-white/5 px-5 py-2.5 text-center text-sm font-medium text-foreground transition-colors hover:bg-white/10"
          >
            Или оставить заявку на сайте
          </a>
        </div>
      </div>
    </div>
  );
}
