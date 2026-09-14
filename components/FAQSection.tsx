const faqs = [
  {
    question: "Сколько это стоит?",
    answer:
      "Стоимость зависит от сложности процессов вашего бизнеса. Точную цифру назовём на созвоне после разбора ваших задач.",
  },
  {
    question: "Сколько времени занимает внедрение?",
    answer: "Обычно 3-5 рабочих дней с момента созвона до запуска.",
  },
  {
    question: "Что если что-то сломается?",
    answer:
      "Мы мониторим работу автоматизации и оперативно исправляем сбои — это входит в поддержку.",
  },
  {
    question: "Нужно ли мне что-то настраивать самому?",
    answer:
      "Нет, мы берём на себя всю техническую настройку. От вас — доступ к нужным каналам (например, WhatsApp Business).",
  },
];

export default function FAQSection() {
  return (
    <section id="faq" className="bg-background-alt py-20">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Частые вопросы
        </h2>
        <div className="mt-12 space-y-6">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <h3 className="text-base font-semibold">{faq.question}</h3>
              <p className="mt-2 text-sm text-muted">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
