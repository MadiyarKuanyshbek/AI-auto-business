export type DemoRule = {
  keywords: string[];
  answer: string;
};

export type Business = {
  slug: string;
  label: string;
  icon: string;
};

export type FlowStep = {
  icon: string;
  title: string;
};

export type BeforeAfter = {
  metric: string;
  before: string;
  after: string;
};

export type Product = {
  id: string;
  icon: string;
  category: string;
  /** Short, benefit-first label for tight UI like Telegram buttons (not the category name — that's internal jargon). */
  menuLabel: string;
  /** One line explaining what menuLabel means, used above a menu of buttons. */
  menuHint: string;
  title: string;
  objectName: string;
  description: string;
  businesses: Business[];
  flow: FlowStep[];
  beforeAfter: BeforeAfter;
  demoGreeting: (businessLabel: string) => string;
  demoHint: string;
  demoRules: DemoRule[];
  demoFallback: string;
};

export const products: Product[] = [
  {
    id: "front-desk",
    icon: "🎯",
    category: "Внешние клиенты",
    menuLabel: "Приём клиентов",
    menuHint: "отвечает 24/7, записывает на услугу",
    title: "Клиентский ИИ-приёмщик (Front-Desk AI)",
    objectName: "ИИ-приёмщик",
    description:
      "Отвечает 24/7 в WhatsApp, Telegram и на сайте, консультирует по ценам и услугам, считает смету и сам записывает клиента в CRM или календарь.",
    businesses: [
      { slug: "auto", label: "СТО и автомойки", icon: "🚗" },
      { slug: "clinic", label: "Медицинские клиники", icon: "🩺" },
      { slug: "beauty", label: "Салоны красоты", icon: "💇" },
      { slug: "hotel", label: "Отели", icon: "🏨" },
      { slug: "realty", label: "Аренда недвижимости", icon: "🏠" },
    ],
    flow: [
      { icon: "💬", title: "Клиент пишет в WhatsApp, Telegram или на сайте" },
      { icon: "🤖", title: "ИИ-приёмщик отвечает и уточняет детали" },
      { icon: "📅", title: "Запись создаётся в CRM или календаре" },
      { icon: "🔔", title: "Вам приходит уведомление о новой записи" },
    ],
    beforeAfter: {
      metric: "Пропущенные звонки",
      before: "Часть заявок терялась, пока мастер был занят ремонтом",
      after: "Заявки принимаются 24/7, запись идёт даже ночью и в выходные",
    },
    demoGreeting: (business) =>
      `Здравствуйте! Я ИИ-приёмщик — помогаю клиентам в сфере «${business}». Чем могу помочь?`,
    demoHint: "Спросите про цену, запись на удобное время или адрес",
    demoRules: [
      {
        keywords: ["цен", "стоимост", "сколько"],
        answer:
          "Базовые услуги — от 5 000 ₸, точная сумма зависит от того, что нужно сделать. Могу сразу записать вас на удобное время?",
      },
      {
        keywords: ["запис", "время", "когда", "свободн"],
        answer: "Ближайшие окна — завтра в 14:00 или 16:30. Какое время вам удобнее?",
      },
      {
        keywords: ["адрес", "где", "находит"],
        answer: "Пришлю адрес и геолокацию сразу после того, как подтвердим время.",
      },
    ],
    demoFallback:
      "Уточню это и напишу вам в течение 10 минут. Хотите, я пока запишу вас на предварительное время?",
  },
  {
    id: "infra",
    icon: "🖥️",
    category: "IT-инфраструктура",
    menuLabel: "IT и серверы",
    menuHint: "следит за сервисами, чинит сбои",
    title: "ИИ-сисадмин / DevOps-агент (Infrastructure AI)",
    objectName: "ИИ-сисадмин",
    description:
      "Мониторит логи серверов, перехватывает ошибки из Sentry, перезапускает упавшие сервисы, предлагает патчи кода и следит за нагрузкой.",
    businesses: [
      { slug: "it-company", label: "IT-компании", icon: "💻" },
      { slug: "saas", label: "SaaS-сервисы", icon: "☁️" },
      { slug: "web-studio", label: "Веб-студии", icon: "🛠️" },
    ],
    flow: [
      { icon: "⚠️", title: "Сервис падает или растёт нагрузка" },
      { icon: "🤖", title: "ИИ-агент видит ошибку в логах (Sentry)" },
      { icon: "🔧", title: "Перезапускает сервис или готовит патч" },
      { icon: "🔔", title: "Дежурному инженеру приходит отчёт" },
    ],
    beforeAfter: {
      metric: "Время реакции на инцидент",
      before: "Ошибку на сервере замечали только по жалобам пользователей",
      after: "ИИ-агент видит сбой в логах и уведомляет дежурного сразу",
    },
    demoGreeting: (business) =>
      `Внимание: обнаружена ошибка 502 на проекте из сферы «${business}». Анализирую логи...`,
    demoHint: "Спросите «что случилось», «нагрузка» или «почини»",
    demoRules: [
      {
        keywords: ["что случ", "ошибк", "статус"],
        answer:
          "Сервис перегружен: 3 воркера упали из-за утечки памяти. Перезапускаю их сейчас.",
      },
      {
        keywords: ["почин", "исправ", "fix", "реши"],
        answer:
          "Перезапустил упавшие процессы, нагрузка стабилизировалась. Подготовил патч, ограничивающий размер кэша — можно посмотреть в PR #482.",
      },
      {
        keywords: ["нагрузк", "cpu", "память", "загруз"],
        answer:
          "CPU: 41%, память: 68%. Пики совпадают с ночной синхронизацией — рекомендую перенести её на менее загруженное время.",
      },
    ],
    demoFallback:
      "Записал это в тикет для дежурного инженера и приложил логи за последние 15 минут.",
  },
  {
    id: "internal-ops",
    icon: "🧑‍💼",
    category: "Сотрудники",
    menuLabel: "Помощник для сотрудников",
    menuHint: "отвечает на вопросы по отпускам, регламентам, IT",
    title: "Внутренний ИИ-админ / HR-помощник (Internal Ops AI)",
    objectName: "HR-бот",
    description:
      "Работает внутри корпоративных чатов Slack или Teams. Онбордит новых сотрудников, отвечает по регламентам и ТК, помогает оформить отпуск или тикет в IT.",
    businesses: [
      { slug: "mid-business", label: "Средний и крупный бизнес", icon: "🏢" },
      { slug: "remote-team", label: "Удалённые команды от 20+ человек", icon: "🌍" },
    ],
    flow: [
      { icon: "💬", title: "Сотрудник пишет вопрос в Slack или Teams" },
      { icon: "🤖", title: "ИИ-админ отвечает по регламенту или создаёт тикет" },
      { icon: "🙋", title: "Сложный вопрос передаётся HR или IT-специалисту" },
      { icon: "✅", title: "Сотрудник получает ответ без ожидания в очереди" },
    ],
    beforeAfter: {
      metric: "Время на типовые HR-вопросы",
      before: "Сотрудники часами ждали ответа по отпускам и регламентам",
      after: "ИИ отвечает сразу, HR подключается только к нестандартным случаям",
    },
    demoGreeting: () =>
      "Привет! Я HR-бот компании. С чем помочь — отпуск, регламенты или тикет в IT?",
    demoHint: "Спросите про «отпуск», «регламент» или «доступ»",
    demoRules: [
      {
        keywords: ["отпуск"],
        answer: "Ваш остаток — 12 дней. Хотите оформить заявление на конкретные даты?",
      },
      {
        keywords: ["регламент", "правил", "трудов"],
        answer:
          "Рабочий день с 9:00 до 18:00, обед — час на выбор с 12:00 до 14:00. Полный регламент пришлю файлом.",
      },
      {
        keywords: ["it", "ноутбук", "доступ", "парол"],
        answer: "Создал тикет #1042 в IT-отдел, вам ответят в течение рабочего дня.",
      },
    ],
    demoFallback: "Уточню у отдела кадров и вернусь с ответом сегодня же.",
  },
  {
    id: "data-admin",
    icon: "📊",
    category: "Данные",
    menuLabel: "Отчёты и данные",
    menuHint: "мгновенные отчёты по выручке и остаткам",
    title: "ИИ-администратор баз данных и знаний (Data & Knowledge Admin)",
    objectName: "ИИ-аналитик",
    description:
      "Актуализирует базы знаний, переводит вопросы руководства на человеческом языке в SQL-запросы и формирует мгновенные отчёты по выручке или остаткам.",
    businesses: [
      { slug: "retail", label: "Ритейл", icon: "🛍️" },
      { slug: "ecommerce", label: "E-commerce", icon: "📦" },
      { slug: "warehouse", label: "Складская логистика", icon: "🚚" },
    ],
    flow: [
      { icon: "💬", title: "Руководитель задаёт вопрос на человеческом языке" },
      { icon: "🤖", title: "ИИ переводит вопрос в SQL-запрос к базе" },
      { icon: "📊", title: "Формируется отчёт с точными цифрами" },
      { icon: "⚡", title: "Ответ приходит в чат за секунды" },
    ],
    beforeAfter: {
      metric: "Скорость отчётов",
      before: "Отчёт по выручке или остаткам готовили вручную часами",
      after: "Ответ с точными цифрами приходит в чат за секунды",
    },
    demoGreeting: () =>
      "Готов сформировать отчёт. Спросите про выручку, остатки на складе или топ товаров.",
    demoHint: "Спросите про «выручку», «остатки» или «топ товаров»",
    demoRules: [
      {
        keywords: ["выручк", "продаж"],
        answer:
          "Выручка за вчера — 1 240 000 ₸, +8% к прошлой неделе. Показать разбивку по категориям?",
      },
      {
        keywords: ["остат", "склад"],
        answer:
          "На складе заканчиваются позиции: гель для душа (12 шт.), шампунь (8 шт.). Сформировать заявку поставщику?",
      },
      {
        keywords: ["топ", "популярн", "лучш"],
        answer: "Топ-3 товара за неделю: кроссовки Air, футболка Basic, рюкзак Trek.",
      },
    ],
    demoFallback: "Уточню структуру данных и пришлю точный ответ с цифрами.",
  },
  {
    id: "community",
    icon: "🛡️",
    category: "Комьюнити",
    menuLabel: "Чаты и комьюнити",
    menuHint: "модерация, ловит горячих клиентов в комментариях",
    title: "ИИ-модератор / Комьюнити-админ (Community AI)",
    objectName: "ИИ-модератор",
    description:
      "Фильтрует спам и мат в Telegram-каналах, отвечает на частые комментарии под постами и перенаправляет горячие лиды из комментариев в директ продаж.",
    businesses: [
      { slug: "blogger", label: "Блогеры", icon: "🎥" },
      { slug: "online-school", label: "Онлайн-школы", icon: "🎓" },
      { slug: "media", label: "Медиа", icon: "📰" },
      { slug: "brand", label: "Бренды с большими чатами", icon: "💬" },
    ],
    flow: [
      { icon: "💬", title: "Подписчик пишет комментарий или вопрос в чате" },
      { icon: "🤖", title: "ИИ фильтрует спам и отвечает по FAQ" },
      { icon: "🔥", title: "Горячий лид пересылается продавцу в директ" },
      { icon: "🙋", title: "Модератор-человек подключается к сложным случаям" },
    ],
    beforeAfter: {
      metric: "Горячие лиды в комментариях",
      before: "Вопросы «как купить» терялись среди сотен комментариев",
      after: "ИИ-модератор сразу пересылает такие сообщения в отдел продаж",
    },
    demoGreeting: () =>
      "Модерирую чат. За последний час — 340 сообщений, 4 из них спам, я их скрыл.",
    demoHint: "Спросите про «спам», «хочу купить» или задайте вопрос",
    demoRules: [
      {
        keywords: ["спам", "реклам"],
        answer: "Обнаружил и удалил 2 рекламных сообщения, автора предупредил.",
      },
      {
        keywords: ["куп", "цена курса", "как купить", "хочу"],
        answer: "Это похоже на горячий лид! Уже переслал сообщение вашему менеджеру продаж в директ.",
      },
    ],
    demoFallback:
      "Отвечаю по FAQ — например, доступ открывается сразу после оплаты. Если вопрос сложнее, перешлю модератору-человеку.",
  },
];

export const OTHER_NICHE_SLUG = "other";
export const OTHER_NICHE_LABEL = "Другое";

/** Все сферы бизнеса из всех продуктов, сгруппированные по продукту — единый источник для формы заявки и бэкенда. */
export function getNicheGroups() {
  return products.map((product) => ({
    category: product.category,
    businesses: product.businesses,
  }));
}

/** Плоская карта slug → label по всем сферам бизнеса, плюс "other". Используется бэкендом для подписи ниши в уведомлениях. */
export function getNicheLabels(): Record<string, string> {
  const labels: Record<string, string> = { [OTHER_NICHE_SLUG]: OTHER_NICHE_LABEL };
  for (const product of products) {
    for (const business of product.businesses) {
      labels[business.slug] = business.label;
    }
  }
  return labels;
}
