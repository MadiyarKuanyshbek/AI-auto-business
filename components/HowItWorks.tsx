import Reveal from "./Reveal";

const steps = [
  {
    step: "1",
    title: "Посмотрите демо",
    description: "Выберите свой бизнес и пообщайтесь с демо-ботом, это 1 минута.",
  },
  {
    step: "2",
    title: "Подключите бота",
    description:
      "Создайте бота в @BotFather (2 минуты, подскажем) и вставьте токен. Или закажите «под ключ», и всё сделаем мы.",
  },
  {
    step: "3",
    title: "7 дней бесплатно",
    description: "Бот сразу работает и отвечает вашим клиентам. Заказы и заявки приходят вам в Telegram.",
  },
  {
    step: "4",
    title: "Оплата и поддержка",
    description:
      "Нравится — оплачиваете переводом на Kaspi, продление в один клик. Мы следим за работой и чиним сбои.",
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
          {steps.map((s, i) => (
            <Reveal key={s.step} delay={i * 100} className="group">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground transition-transform duration-300 group-hover:scale-110">
                {s.step}
              </div>
              <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.description}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
