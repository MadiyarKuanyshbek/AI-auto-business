import { products, type Business, type Product } from "@/lib/products";

export type GroupMatch = {
  product: Product;
  business: Business;
  matchedKeyword: string;
};

// Признаки, что автор поста САМ ПРЕДЛАГАЕТ услугу (бизнес/мастер), а не
// ищет исполнителя себе. Это и есть наш лид — у него уже есть поток заявок,
// который можно автоматизировать. Обычных людей, которые просто ищут мастера
// себе («ищу мастера маникюра»), намеренно НЕ ловим — им наш продукт не нужен,
// мы продаём бизнесам, а не частным лицам.
const PROVIDER_SIGNALS = [
  "предлага",
  "оказыва",
  "выполня",
  "принимаю запис",
  "принимаем запис",
  "запись открыт",
  "свободн окошк",
  "свободные окна",
  "ищу клиентов",
  "в поиске клиентов",
  "набираю клиентов",
  "нужны клиенты",
  "стаж работы",
  "портфолио",
  "звоните",
  "пишите в директ",
  "пишите в лс",
  "запись в директ",
  "услуги мастера",
  "мастер по ",
  "работаю на дому",
  "выезд на дом",
  "с выездом",
  "профессионально сделаю",
];

// Ключевые слова ниши прямо в тексте сообщения. Не все 17 ниш из lib/products.ts
// сюда входят — только те, что реально встречаются как объявления в чатах (а не
// корпоративные продукты вроде "средний бизнес" или "блогеры").
const NICHE_KEYWORDS: Record<string, string[]> = {
  auto: ["автосервис", "автомойк", "ремонт авто", "шиномонтаж", "мастер по авто"],
  clinic: ["клиник", "стоматолог", "врач", "массажист"],
  beauty: ["маникюр", "парикмахер", "бровист", "лешмейкер", "салон красоты", "мастер по волосам"],
  hotel: ["отель", "гостиниц", "хостел"],
  realty: ["квартир", "риелтор", "недвижимост", "снять жиль", "сдать жиль"],
  "it-company": ["программист", "разработчик", "it-компан", "айти компан"],
  "web-studio": ["сайт сделать", "лендинг", "разработка сайта", "веб-студия"],
  retail: ["поставщик", "купить оптом"],
  warehouse: ["склад ", "складск", "логистика"],
  "online-school": ["репетитор", "курсы английск", "преподаватель", "онлайн школа"],
};

/** Ищет в тексте группового сообщения признаки "автор сам предлагает услугу под нашу нишу" — это лид. */
export function detectGroupRequest(text: string): GroupMatch | null {
  const normalized = text.toLowerCase();
  const hasProviderSignal = PROVIDER_SIGNALS.some((word) => normalized.includes(word));
  if (!hasProviderSignal) return null;

  for (const [slug, keywords] of Object.entries(NICHE_KEYWORDS)) {
    const matchedKeyword = keywords.find((keyword) => normalized.includes(keyword));
    if (!matchedKeyword) continue;

    for (const product of products) {
      const business = product.businesses.find((b) => b.slug === slug);
      if (business) return { product, business, matchedKeyword };
    }
  }

  return null;
}

const SITE_DEMO_LINK = process.env.SITE_URL
  ? `${process.env.SITE_URL.replace(/\/$/, "")}/#products`
  : "https://ai-automation-agency-swart.vercel.app/#products";

/** Черновик ответа автору поста (бизнесу/мастеру) — отправлять вручную, в группе или в личку. */
export function buildGroupPitch(match: GroupMatch, authorName?: string): string {
  const { product, business } = match;
  const greeting = authorName ? `Здравствуйте, ${authorName}!` : "Здравствуйте!";
  return (
    `${greeting} Увидел ваше объявление про «${business.label.toLowerCase()}». ` +
    `Обычно на таких объявлениях часть обращений теряется или на них долго отвечают. ` +
    `Мы делаем ${product.objectName}: ${product.description} ` +
    `Можно посмотреть живое демо для вашей сферы: ${SITE_DEMO_LINK}`
  );
}
