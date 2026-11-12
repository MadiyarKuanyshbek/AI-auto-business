import Reveal from "./Reveal";
import { getSubscriptionPrice, TURNKEY_SETUP_KZT } from "@/lib/subscriptionPricing";

const price = (getSubscriptionPrice("front-desk") ?? 0).toLocaleString("ru-RU");
const turnkey = TURNKEY_SETUP_KZT.toLocaleString("ru-RU");

const faqs = [
  {
    question: "Сколько это стоит?",
    answer: `Тариф «Старт» — ${price} ₸ в месяц, первые 7 дней бесплатно. Настройка «под ключ» — ${turnkey} ₸ разово. Нестандартные задачи (CRM, отчёты, мониторинг) оцениваем по заявке.`,
  },
  {
    question: "Что умеет бот?",
    answer:
      "Отвечает клиентам по вашим услугам, ценам и графику, принимает заказы по меню, считает сумму, принимает чек об оплате и присылает всё вам в Telegram. Запись в ваш календарь или CRM бот сам не ставит: он передаёт вам заявку (интеграции — под заказ).",
  },
  {
    question: "Нужно ли мне что-то настраивать самому?",
    answer:
      "Нужно создать бота в @BotFather (2 минуты, инструкция в форме) и внести меню или прайс. Если не хотите — закажите «под ключ», мы сделаем всё за вас.",
  },
  {
    question: "Что будет после 7 дней бесплатного периода?",
    answer:
      "За 3 и за 1 день мы напомним об оплате. Если не оплатить, бот приостанавливается. Ничего не списывается автоматически, данные карты у нас не хранятся.",
  },
  {
    question: "Что если что-то сломается?",
    answer:
      "Система сама проверяет работу ботов и переподключает сбойные. Остальное исправляем мы, это входит в подписку.",
  },
  {
    question: "А WhatsApp?",
    answer:
      "Сейчас запускаем в Telegram: он не требует платных лимитов и отдельных серверов. WhatsApp подключаем по заявке.",
  },
];

export default function FAQSection() {
  return (
    <section id="faq" className="bg-background-alt py-20">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal>
          <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Частые вопросы
          </h2>
        </Reveal>
        <div className="mt-12 space-y-6">
          {faqs.map((faq, i) => (
            <Reveal key={faq.question} delay={i * 80}>
              <div>
                <h3 className="text-base font-semibold">{faq.question}</h3>
                <p className="mt-2 text-sm text-muted">{faq.answer}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
