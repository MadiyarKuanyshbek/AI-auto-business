import TelegramButton from "./TelegramButton";
import WhatsAppButton from "./WhatsAppButton";

export default function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
      <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-accent">
        ИИ-автоматизации под ключ
      </p>
      <h1 className="mx-auto max-w-2xl text-balance font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
        Пропущенные звонки <span className="text-accent">стоят вам клиентов</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
        Мы настраиваем ИИ-администратора, который отвечает клиентам в WhatsApp
        24/7, записывает на услугу и напоминает о визите — без найма нового
        сотрудника.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <TelegramButton className="px-8 py-3 text-base" />
        <a
          href="#products"
          className="rounded-full border border-border px-8 py-3 text-base font-medium text-foreground transition-colors hover:bg-white/5"
        >
          Смотреть продукты
        </a>
      </div>
      <WhatsAppButton
        className="mt-4 !inline-flex !bg-transparent !px-0 !text-muted hover:!bg-transparent hover:!text-foreground"
      >
        или напишите нам в WhatsApp
      </WhatsAppButton>
    </section>
  );
}
