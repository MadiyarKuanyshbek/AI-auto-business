const steps = [
  {
    step: "1",
    title: "Заявка",
    description: "Вы оставляете заявку на сайте — мы перезваниваем в течение дня.",
  },
  {
    step: "2",
    title: "Созвон",
    description: "15-минутный разговор: разбираем ваши процессы и подбираем продукт.",
  },
  {
    step: "3",
    title: "Настройка",
    description: "Настраиваем и запускаем автоматизацию под ваш бизнес — обычно за 3-5 дней.",
  },
  {
    step: "4",
    title: "Запуск и поддержка",
    description: "Автоматизация работает, мы следим за ней и оперативно чиним всё, что ломается.",
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-background-alt py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Как это работает
        </h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-4">
          {steps.map((s) => (
            <div key={s.step}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                {s.step}
              </div>
              <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
