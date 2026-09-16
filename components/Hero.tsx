import TelegramButton from "./TelegramButton";
import WhatsAppButton from "./WhatsAppButton";

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
      <div
        aria-hidden="true"
        className="glow-pulse pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-accent/25 blur-[120px]"
      />
      <div className="mx-auto max-w-6xl">
        <p className="animate-fade-up mb-4 text-sm font-semibold uppercase tracking-wide text-accent">
          ИИ-автоматизации под ключ
        </p>
        <h1 className="animate-fade-up mx-auto max-w-2xl text-balance font-display text-4xl font-extrabold tracking-tight [animation-delay:100ms] sm:text-6xl">
          Пропущенные звонки <span className="text-accent">стоят вам клиентов</span>
        </h1>
        <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg text-muted [animation-delay:200ms]">
          Мы настраиваем ИИ-администратора, который отвечает клиентам в WhatsApp
          24/7, записывает на услугу и напоминает о визите — без найма нового
          сотрудника.
        </p>
        <div className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row [animation-delay:300ms]">
          <WhatsAppButton className="px-8 py-3 text-base">
            Написать в WhatsApp
          </WhatsAppButton>
          <TelegramButton className="px-8 py-3 text-base transition-transform hover:scale-[1.03] active:scale-[0.98]" />
          <a
            href="#products"
            className="rounded-full border border-border px-8 py-3 text-base font-medium text-foreground transition-all hover:scale-[1.03] hover:bg-white/5 active:scale-[0.98]"
          >
            Смотреть продукты
          </a>
        </div>
      </div>
    </section>
  );
}
