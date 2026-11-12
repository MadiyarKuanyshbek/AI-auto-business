import Link from "next/link";
import Reveal from "./Reveal";
import { getSubscriptionPrice, TURNKEY_SETUP_KZT } from "@/lib/subscriptionPricing";

const kzt = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;

export default function PricingSection() {
  const price = getSubscriptionPrice("front-desk") ?? 0;

  return (
    <section id="pricing" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">Тарифы</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
            Без скрытых платежей. Первые 7 дней бесплатно, карта не нужна. Оплата переводом на Kaspi, отказаться
            можно в любой момент.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          <Reveal className="flex">
            <div className="flex w-full flex-col rounded-2xl border border-accent/50 bg-surface p-6 shadow-lg shadow-accent/5">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">Старт</p>
              <p className="mt-3 font-display text-4xl font-extrabold">
                {kzt(price)}
                <span className="text-base font-medium text-muted"> / мес</span>
              </p>
              <p className="mt-1 text-sm text-muted">Подключаете бота сами за 5 минут</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                <li>✅ ИИ-бот в Telegram отвечает клиентам 24/7</li>
                <li>✅ Знает ваши услуги, цены, график, адрес</li>
                <li>✅ Приём заказов по меню, подсчёт суммы, чек об оплате</li>
                <li>✅ Заявки и заказы приходят вам в Telegram</li>
                <li>✅ Личный кабинет: настройки и история заказов</li>
                <li>✅ Автоматический контроль и самовосстановление</li>
              </ul>
              <Link
                href="/register/front-desk"
                className="mt-6 block rounded-full bg-accent px-5 py-3 text-center text-sm font-semibold text-accent-foreground transition-all hover:scale-[1.02] hover:bg-accent/90"
              >
                Попробовать 7 дней бесплатно
              </Link>
            </div>
          </Reveal>

          <Reveal delay={80} className="flex">
            <div className="flex w-full flex-col rounded-2xl border border-border bg-surface p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">Под ключ</p>
              <p className="mt-3 font-display text-4xl font-extrabold">
                {kzt(TURNKEY_SETUP_KZT)}
                <span className="text-base font-medium text-muted"> разово</span>
              </p>
              <p className="mt-1 text-sm text-muted">+ подписка {kzt(price)}/мес</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                <li>✅ Всё из тарифа «Старт»</li>
                <li>✅ Мы создаём бота, вносим меню/прайс и тестируем с вами</li>
                <li>✅ Подключаем уведомления вам и вашим сотрудникам</li>
                <li>✅ Первая неделя правок включена</li>
              </ul>
              <a
                href="#lead-form"
                className="mt-6 block rounded-full border border-accent/40 bg-accent/10 px-5 py-3 text-center text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                Оставить заявку
              </a>
            </div>
          </Reveal>

          <Reveal delay={160} className="flex">
            <div className="flex w-full flex-col rounded-2xl border border-border bg-surface p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">Индивидуально</p>
              <p className="mt-3 font-display text-4xl font-extrabold">по заявке</p>
              <p className="mt-1 text-sm text-muted">Цену называем после разбора задачи</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                <li>🔧 Интеграции с CRM, 1С, таблицами</li>
                <li>🖥️ Мониторинг серверов и сервисов</li>
                <li>📊 Отчёты и аналитика по вашим данным</li>
                <li>🛡️ Модерация чатов и сообществ</li>
              </ul>
              <a
                href="#lead-form"
                className="mt-6 block rounded-full border border-border px-5 py-3 text-center text-sm font-semibold transition-colors hover:bg-white/5"
              >
                Обсудить проект
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
