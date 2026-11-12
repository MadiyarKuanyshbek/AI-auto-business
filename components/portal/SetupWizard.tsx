"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ExtractedBusiness } from "@/lib/onboarding";

type Item = { name: string; price: number | null };

const inputClass =
  "w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

export default function SetupWizard({
  botUsername,
  deepLink,
  telegramLinked,
  initialKaspi,
}: {
  botUsername: string | null;
  deepLink: string | null;
  telegramLinked: boolean;
  initialKaspi: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<"input" | "analyzing" | "review" | "saving" | "done">("input");
  const [error, setError] = useState("");

  const [meta, setMeta] = useState({ summary: "", address: "", phone: "", opens: "", closes: "" });
  const [items, setItems] = useState<Item[]>([]);
  const [orderable, setOrderable] = useState(false);
  const [enableOrders, setEnableOrders] = useState(false);
  const [kaspi, setKaspi] = useState(initialKaspi);
  const [ordersEnabled, setOrdersEnabled] = useState(false);

  async function analyze(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() && files.length === 0) {
      setError("Вставьте текст или загрузите файл с прайсом или меню.");
      return;
    }
    setError("");
    setPhase("analyzing");
    try {
      const form = new FormData();
      form.set("text", text);
      files.forEach((f) => form.append("files", f));
      const response = await fetch("/api/portal/onboarding/analyze", { method: "POST", body: form });
      if (!response.ok) {
        const { error: code } = await response.json().catch(() => ({ error: "" }));
        throw new Error(
          code === "file_too_large"
            ? "Файл больше 3,5 МБ. Сожмите его или загрузите фото страницы."
            : code === "unsupported_type"
              ? "Поддерживаются фото (JPG, PNG), PDF и текст. Документ Word или Excel сохраните как PDF."
              : code === "extraction_failed"
                ? "Не получилось разобрать. Попробуйте вставить текст прайса или другое фото."
                : "Не удалось обработать. Попробуйте ещё раз.",
        );
      }
      const { data } = (await response.json()) as { data: ExtractedBusiness };
      setMeta({
        summary: data.summary,
        address: data.address ?? "",
        phone: data.phone ?? "",
        opens: data.opens ?? "",
        closes: data.closes ?? "",
      });
      const list = data.orderable ? data.menu_items : data.services;
      setItems(list.map((i) => ({ name: i.name, price: i.price ?? null })));
      setOrderable(data.orderable);
      setEnableOrders(data.orderable);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setPhase("input");
    }
  }

  async function save() {
    setError("");
    if (enableOrders && !kaspi.trim()) {
      setError("Укажите реквизиты Kaspi, куда клиенты будут переводить оплату.");
      return;
    }
    const clean = items.filter((i) => i.name.trim());
    const data: ExtractedBusiness = {
      summary: meta.summary,
      address: meta.address || null,
      phone: meta.phone || null,
      opens: meta.opens || null,
      closes: meta.closes || null,
      services: clean.map((i) => ({ name: i.name.trim(), price: i.price })),
      orderable,
      menu_items: orderable ? clean.filter((i) => i.price).map((i) => ({ name: i.name.trim(), price: i.price as number })) : [],
    };
    setPhase("saving");
    try {
      const response = await fetch("/api/portal/onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, enableOrders, kaspiRequisites: kaspi }),
      });
      if (!response.ok) throw new Error("save");
      const result = (await response.json()) as { ordersEnabled: boolean };
      setOrdersEnabled(result.ordersEnabled);
      setPhase("done");
    } catch {
      setError("Не удалось сохранить. Попробуйте ещё раз.");
      setPhase("review");
    }
  }

  if (phase === "done") {
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/10 p-6 text-center">
        <p className="text-lg font-semibold">Бот готов ✅</p>
        <p className="mt-2 text-sm text-muted">
          {ordersEnabled
            ? "Бот принимает заказы по вашему меню, считает сумму и просит чек об оплате."
            : "Бот отвечает по вашим услугам и ценам и передаёт вам заявки с телефоном клиента."}{" "}
          Напишите ему сами, чтобы проверить.
        </p>
        {botUsername && (
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground"
          >
            Открыть бота @{botUsername}
          </a>
        )}
        <button onClick={() => router.push("/portal")} className="mt-3 block w-full text-sm text-muted underline">
          В личный кабинет
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-white/5 p-5">
        <p className="text-sm font-semibold">Шаг 1. Получайте заявки и заказы в Telegram</p>
        {telegramLinked ? (
          <p className="mt-2 text-sm text-emerald-500">✅ Telegram привязан: заявки будут приходить вам.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Нажмите кнопку и в открывшемся чате нажмите «Запустить» (Start). Без этого бот не сможет присылать вам
              заявки.
            </p>
            {deepLink && (
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground"
              >
                Привязать Telegram
              </a>
            )}
            <button onClick={() => router.refresh()} className="ml-3 text-sm text-muted underline">
              Я нажал Start
            </button>
          </>
        )}
      </section>

      {(phase === "input" || phase === "analyzing") && (
        <form onSubmit={analyze} className="rounded-2xl border border-border bg-white/5 p-5">
          <p className="text-sm font-semibold">Шаг 2. Расскажите о бизнесе: прайс, меню, описание</p>
          <p className="mt-1 text-sm text-muted">
            Вставьте текст как есть или загрузите фото/PDF прайса. ИИ сам выделит услуги, цены, часы работы и адрес,
            а вы проверите.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={"Например:\nСалон «Лотос», Алматы, ул. Абая 10. Работаем с 10:00 до 20:00.\nСтрижка женская — 6000, маникюр — 5000, окрашивание — от 15000..."}
            className={`${inputClass} mt-3`}
          />
          <label className="mt-3 block text-sm text-muted">
            Или файлы (до 4 штук, фото JPG/PNG, PDF, TXT; до 3,5 МБ каждый):
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="mt-1 block w-full text-sm"
            />
          </label>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={phase === "analyzing"}
            className="mt-4 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            {phase === "analyzing" ? "Читаю, подождите до минуты..." : "Разобрать с помощью ИИ"}
          </button>
        </form>
      )}

      {(phase === "review" || phase === "saving") && (
        <div className="space-y-5 rounded-2xl border border-border bg-white/5 p-5">
          <p className="text-sm font-semibold">Шаг 3. Проверьте, что понял ИИ, и поправьте</p>

          <label className="block text-sm">
            О бизнесе
            <textarea
              value={meta.summary}
              onChange={(e) => setMeta({ ...meta, summary: e.target.value })}
              rows={3}
              className={`${inputClass} mt-1`}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Адрес
              <input value={meta.address} onChange={(e) => setMeta({ ...meta, address: e.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-sm">
              Телефон
              <input value={meta.phone} onChange={(e) => setMeta({ ...meta, phone: e.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-sm">
              Открываемся
              <input type="time" value={meta.opens} onChange={(e) => setMeta({ ...meta, opens: e.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-sm">
              Закрываемся
              <input type="time" value={meta.closes} onChange={(e) => setMeta({ ...meta, closes: e.target.value })} className={`${inputClass} mt-1`} />
            </label>
          </div>

          <div>
            <p className="text-sm">{orderable ? "Меню" : "Услуги и цены"} ({items.length})</p>
            <div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={item.name}
                    onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className={inputClass}
                  />
                  <input
                    inputMode="numeric"
                    value={item.price ?? ""}
                    placeholder="₸"
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/\D/g, ""));
                      setItems(items.map((x, j) => (j === i ? { ...x, price: n > 0 ? n : null } : x)));
                    }}
                    className={`${inputClass} w-28 shrink-0`}
                  />
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                    className="px-2 text-muted hover:text-foreground"
                    aria-label="Удалить"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setItems([...items, { name: "", price: null }])}
              className="mt-2 text-sm text-accent"
            >
              + Добавить строку
            </button>
          </div>

          {orderable && (
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={enableOrders} onChange={(e) => setEnableOrders(e.target.checked)} className="mt-1" />
                <span>
                  <b>Принимать заказы в боте</b>: клиент выбирает позиции, бот считает сумму, берёт самовывоз или
                  доставку, просит чек об оплате и присылает вам готовый заказ.
                </span>
              </label>
              {enableOrders && (
                <label className="mt-3 block text-sm">
                  Реквизиты Kaspi для оплаты (покажем клиенту)
                  <input
                    value={kaspi}
                    onChange={(e) => setKaspi(e.target.value)}
                    placeholder="Kaspi Gold: +7 7XX XXX XX XX (Имя)"
                    className={`${inputClass} mt-1`}
                  />
                </label>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={phase === "saving"}
              className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
            >
              {phase === "saving" ? "Сохраняем..." : "Сохранить и запустить бота"}
            </button>
            <button onClick={() => setPhase("input")} className="text-sm text-muted underline">
              Назад
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
