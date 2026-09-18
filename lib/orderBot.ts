import { sql, type MenuItem, type OrderItem, type OrderLanguage, type PaymentFileKind, type SubscriptionRow, type TelegramOrderRow } from "@/lib/db";
import { sendTelegramMessageAs, sendTelegramPhotoAs, sendTelegramDocumentAs, notifyOwner } from "@/lib/telegram";
import { generateJsonReply } from "@/src/gemini";
import { SITE_URL } from "@/lib/siteUrl";

// Фото реального меню (см. public/menu) — отправляются вместе с текстовым
// списком, чтобы клиенту было наглядно. Пока общие для всех подписок; когда
// появится самостоятельная загрузка меню клиентом, путь переедет в БД.
const MENU_PHOTO_URLS = [`${SITE_URL}/menu/page1.jpg`, `${SITE_URL}/menu/page2.jpg`];

type IncomingMessage = {
  text?: string;
  fileId?: string;
  fileKind?: PaymentFileKind;
  chatId: number;
  customerName: string | null;
};

const KZ_CHARS = /[әғқңөұүһі]/i;
function detectLanguage(text: string): OrderLanguage {
  return KZ_CHARS.test(text) ? "kz" : "ru";
}

const ALMATY_TZ = "Asia/Almaty";

/** null у opens_at/closes_at = часы работы не заданы, бот всегда «открыт». */
function isOpenNow(sub: SubscriptionRow): boolean {
  if (!sub.opens_at || !sub.closes_at) return true;
  const nowLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: ALMATY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const opens = sub.opens_at.slice(0, 5);
  const closes = sub.closes_at.slice(0, 5);
  // Часы, закрывающиеся за полночь (например 10:00–02:00), сравниваем иначе,
  // чем обычное дневное окно.
  if (closes < opens) return nowLabel >= opens || nowLabel < closes;
  return nowLabel >= opens && nowLabel < closes;
}

const CANCEL_WORDS = ["отмена", "отменить", "стоп", "бас тарт", "тоқтат"];
const MENU_WORDS = ["/menu", "меню", "мәзір"];
const PICKUP_WORDS = ["самовывоз", "заберу", "сам заберу", "сам заеду", "өзім ал"];
const DELIVERY_WORDS = ["доставк", "привез", "жетк", "әкел"];
const YES_WORDS = ["да", "верно", "ок", "окей", "подтвер", "давай", "го", "иә", "дұрыс"];
const NO_WORDS = ["нет", "измен", "не так", "поправ", "жоқ"];

function matchesAny(text: string, words: string[]) {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function formatMenuText(menu: MenuItem[]): string {
  return menu.map((item) => `• ${item.name} — ${item.price.toLocaleString("ru-RU")} ₸`).join("\n");
}

function formatCart(items: OrderItem[]): string {
  return items
    .map((item, i) => `${i + 1}. ${item.name} — ${item.qty} шт. × ${item.price.toLocaleString("ru-RU")} ₸ = ${(item.price * item.qty).toLocaleString("ru-RU")} ₸`)
    .join("\n");
}

function computeTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function mergeCart(cart: OrderItem[], deltas: { name: string; qty: number }[], menu: MenuItem[]): OrderItem[] {
  const next = cart.map((item) => ({ ...item }));
  for (const delta of deltas) {
    if (!delta || typeof delta.name !== "string") continue;
    const menuItem = menu.find((m) => m.name.toLowerCase() === delta.name.toLowerCase());
    if (!menuItem) continue;
    const qty = Math.max(1, Math.floor(Number(delta.qty)) || 1);
    const existing = next.find((item) => item.name === menuItem.name);
    if (existing) existing.qty += qty;
    else next.push({ name: menuItem.name, price: menuItem.price, qty });
  }
  return next;
}

/** removeQty отсутствует ("убрать картошку целиком") — убирает позицию
 * полностью; если указано число ("уберите один донер") — просто уменьшает
 * количество, удаляя строку, если дошло до нуля. */
function removeFromCart(cart: OrderItem[], deltas: { name: string; qty?: number }[], menu: MenuItem[]): OrderItem[] {
  let next = cart.map((item) => ({ ...item }));
  for (const delta of deltas) {
    if (!delta || typeof delta.name !== "string") continue;
    const menuItem = menu.find((m) => m.name.toLowerCase() === delta.name.toLowerCase());
    if (!menuItem) continue;
    const existing = next.find((item) => item.name === menuItem.name);
    if (!existing) continue;
    if (typeof delta.qty === "number" && delta.qty > 0) {
      existing.qty -= Math.floor(delta.qty);
    } else {
      existing.qty = 0;
    }
    if (existing.qty <= 0) next = next.filter((item) => item.name !== menuItem.name);
  }
  return next;
}

const T = {
  ru: {
    greeting: () =>
      `Здравствуйте! 🌯 Это Doner Mangalo.\n\nНапишите, что хотите заказать (например: «2 донера говяжьих в лаваше и картошку»). Полное меню — командой /menu.`,
    closedNotice: (opens: string, closes: string) =>
      `⏰ Сейчас мы не работаем (часы работы: ${opens}–${closes}). Можете оформить заказ заранее — начнём готовить, как только откроемся.\n\n`,
    menu: (menuText: string) => `📋 Меню:\n\n${menuText}\n\nНапишите, что и сколько хотите заказать.`,
    itemsAdded: (cartText: string, total: number) =>
      `Добавил в заказ:\n${cartText}\n\nИтого: ${total.toLocaleString("ru-RU")} ₸\n\nЕщё что-нибудь? Если всё — напишите «всё» или «оформляйте».`,
    unclearItem: (menuText: string) =>
      `Не нашёл такую позицию в меню 🤔 Вот что у нас есть:\n\n${menuText}\n\nНапишите название блюда точнее.`,
    unclearNote: () =>
      `\n\n⚠️ Часть сообщения не распознал как позицию меню (напитки и десерты бот пока не оформляет — их можно уточнить у Саиды при получении заказа). Если хотели добавить что-то ещё из основного меню — напишите /menu.`,
    emptyCartFinish: () => `Похоже, заказ пока пустой. Что будете заказывать?`,
    askDelivery: (cartText: string, total: number) =>
      `Ваш заказ:\n${cartText}\n\nИтого: ${total.toLocaleString("ru-RU")} ₸\n\nСамовывоз или доставка? Если доставка — сразу напишите адрес.`,
    askAddress: () => `На какой адрес доставить заказ?`,
    confirm: (summary: string) => `${summary}\n\nВсё верно? Напишите «да», чтобы отправить заказ в оплату, или «нет», если нужно что-то изменить.`,
    backToEdit: () => `Хорошо, что изменить? Можете добавить позиции или написать «уберите X» — уберу лишнее.`,
    paymentAsk: (requisites: string) =>
      `Отлично! Прежде чем переведёте — напишите, пожалуйста, ваше имя (как оно указано в Kaspi-переводе, чтобы мы точно сверили оплату).\n\nЗатем переведите сумму на Kaspi:\n${requisites}\n\nЧек можно прислать сюда как скриншотом (фото), так и файлом — как удобнее.`,
    payerNameSaved: () => `Принял, спасибо! Жду чек — фото или файл.`,
    paymentQuestionForwarded: () =>
      `Передал ваше сообщение хозяйке, она ответит вам здесь же. А пока — жду чек об оплате, фото или файлом.`,
    paymentReminder: () => `Жду чек об оплате — пришлите его сюда фото или файлом.`,
    orderSent: () => `Спасибо! Заказ и чек отправлены — как только подтвердим оплату, начнём готовить. 🙏`,
    orderReadyPickup: () => `🎉 Ваш заказ готов! Можно забирать.`,
    orderReadyDelivery: () => `🎉 Ваш заказ готов, курьер уже выезжает!`,
    cancelled: () => `Заказ отменён. Напишите в любой момент, если захотите оформить новый.`,
    fallback: () => `Извините, не совсем понял 🙏 Напишите /menu чтобы увидеть меню, или опишите заказ подробнее.`,
  },
  kz: {
    greeting: () =>
      `Сәлеметсіз бе! 🌯 Бұл Doner Mangalo.\n\nНе тапсырыс бергіңіз келетінін жазыңыз (мысалы: «2 сиыр донер лавашта және картоп фри»). Толық мәзір — /menu.`,
    closedNotice: (opens: string, closes: string) =>
      `⏰ Қазір біз жұмыс істемейміз (жұмыс уақыты: ${opens}–${closes}). Алдын ала тапсырыс беруге болады — ашылған соң дайындай бастаймыз.\n\n`,
    menu: (menuText: string) => `📋 Мәзір:\n\n${menuText}\n\nНе және қанша керек екенін жазыңыз.`,
    itemsAdded: (cartText: string, total: number) =>
      `Тапсырысқа қостым:\n${cartText}\n\nБарлығы: ${total.toLocaleString("ru-RU")} ₸\n\nТағы бірдеңе керек пе? Болса — «болды» немесе «рәсімдеңіз» деп жазыңыз.`,
    unclearItem: (menuText: string) =>
      `Мұндай тағамды мәзірден таппадым 🤔 Мәзір:\n\n${menuText}\n\nАтауын нақтырақ жазыңыз.`,
    unclearNote: () =>
      `\n\n⚠️ Хабарламаның бір бөлігін мәзір позициясы ретінде таба алмадым (сусындар мен десерттерді бот әзірге қабылдамайды — тапсырысты алғанда Саидадан сұрауға болады). Негізгі мәзірден тағы бірдеңе қосу керек болса — /menu жазыңыз.`,
    emptyCartFinish: () => `Тапсырыс әлі бос сияқты. Не тапсырасыз?`,
    askDelivery: (cartText: string, total: number) =>
      `Тапсырысыңыз:\n${cartText}\n\nБарлығы: ${total.toLocaleString("ru-RU")} ₸\n\nӨзіңіз алып кетесіз бе, әлде жеткізу керек пе? Жеткізу болса — мекенжайды жазыңыз.`,
    askAddress: () => `Қай мекенжайға жеткізу керек?`,
    confirm: (summary: string) => `${summary}\n\nБәрі дұрыс па? Төлемге жіберу үшін «иә» деп жазыңыз, өзгерту керек болса — «жоқ».`,
    backToEdit: () => `Жарайды, нені өзгерту керек? Позиция қосуға немесе «X-ті алып тастаңыз» деп жазуға болады.`,
    paymentAsk: (requisites: string) =>
      `Тамаша! Аударым жасамас бұрын атыңызды жазыңыз (Kaspi аударымындағыдай — төлемді дәл салыстыру үшін).\n\nСодан кейін Kaspi-ға аударыңыз:\n${requisites}\n\nЧекті скриншот немесе файл түрінде жіберуге болады — қалай ыңғайлы, солай.`,
    payerNameSaved: () => `Қабылдадым, рахмет! Чекті күтемін — фото немесе файл.`,
    paymentQuestionForwarded: () =>
      `Хабарламаңызды қожайынға жеткіздім, осында жауап береді. Ал әзірге — төлем чегін күтемін, фото немесе файл түрінде.`,
    paymentReminder: () => `Төлем чегін күтіп тұрмын — осында фото немесе файл жіберіңіз.`,
    orderSent: () => `Рахмет! Тапсырыс пен чек жіберілді — төлем расталған соң дайындай бастаймыз. 🙏`,
    orderReadyPickup: () => `🎉 Тапсырысыңыз дайын! Алып кетуге болады.`,
    orderReadyDelivery: () => `🎉 Тапсырысыңыз дайын, курьер жолға шықты!`,
    cancelled: () => `Тапсырыс тоқтатылды. Кез келген уақытта жаңа тапсырыс беруге жазыңыз.`,
    fallback: () => `Кешіріңіз, толық түсінбедім 🙏 Мәзірді көру үшін /menu жазыңыз немесе тапсырысты толығырақ сипаттаңыз.`,
  },
};

type ParsedOrder = {
  items: { name: string; qty: number }[];
  removeItems: { name: string; qty?: number }[];
  finished: boolean;
  unclear: boolean;
};

async function extractOrderItems(menu: MenuItem[], userMessage: string): Promise<ParsedOrder | null> {
  const prompt = `Ты — ассистент, который разбирает сообщение клиента точки быстрого питания и определяет, какие позиции меню он хочет добавить или убрать из заказа.

Меню (точные названия и цены в тенге):
${formatMenuText(menu)}

Правила:
- В поле "items" перечисли позиции, которые клиент хочет ДОБАВИТЬ, в поле "removeItems" — которые хочет УБРАТЬ или уменьшить в количестве (например: "уберите картошку", "без сыра", "один донер лишний, уберите").
- В обоих полях используй ТОЧНОЕ название позиции из меню выше (символ в символ). Не пропускай ни одной упомянутой позиции.
- Будь ОСОБЕННО внимателен к виду мяса — "говяжий", "куриный" и "ассорти" это РАЗНЫЕ позиции, не путай их между собой.
- В "items" если количество явно не указано — считай его равным 1. В "removeItems" поле "qty" указывай, ТОЛЬКО если клиент явно назвал число, на которое убавить; если он хочет убрать позицию целиком — просто не указывай "qty" совсем.
- Если клиент говорит, что закончил заказ ("всё", "это всё", "больше ничего", "оформляйте", "хватит", "давай оформляй", "болды") — поставь "finished": true.
- Если упомянутое блюдо не удаётся уверенно сопоставить ни с одной позицией меню — не добавляй его ни в items, ни в removeItems, и поставь "unclear": true.
- Если сообщение вообще не про заказ (приветствие, вопрос и т.п.) — верни пустые items/removeItems, finished:false, unclear:false.

Примеры:
Сообщение: "2 донера куриных в лаваше и картошку фри"
Ответ: {"items": [{"name": "Донер куриный в лаваше", "qty": 2}, {"name": "Картофель фри с соусом", "qty": 1}], "removeItems": [], "finished": false, "unclear": false}
Сообщение: "уберите картошку, и один донер лишний"
Ответ: {"items": [], "removeItems": [{"name": "Картофель фри с соусом"}, {"name": "Донер куриный в лаваше", "qty": 1}], "finished": false, "unclear": false}

Ответь СТРОГО в формате JSON без пояснений, всегда включай оба поля (пустой массив [], если позиций нет):
{"items": [{"name": "точное название из меню", "qty": число}], "removeItems": [{"name": "точное название из меню", "qty": число}], "finished": boolean, "unclear": boolean}`;

  // Не даём вебхуку зависнуть дольше таймаута Telegram — если Gemini не
  // успела за 25с, просим клиента повторить, а не молчим до 30с maxDuration.
  const raw = await Promise.race([
    generateJsonReply<Partial<ParsedOrder>>(prompt, userMessage),
    new Promise<Partial<ParsedOrder> | "TIMEOUT">((resolve) => setTimeout(() => resolve("TIMEOUT"), 25000)),
  ]);

  if (raw === "TIMEOUT" || !raw) return null;
  // Модель иногда возвращает не совсем ту форму (например, без "items") —
  // не даём этому уронить обработчик, просто нормализуем к безопасному виду.
  return {
    items: Array.isArray(raw.items) ? raw.items : [],
    removeItems: Array.isArray(raw.removeItems) ? raw.removeItems : [],
    finished: raw.finished === true,
    unclear: raw.unclear === true,
  };
}

async function getOrCreateOrder(subscriptionId: number, chatId: number, customerName: string | null, language: OrderLanguage) {
  // sql гарантированно не null — единственный вызывающий (processOrderMessage) проверяет это раньше.
  const db = sql!;
  const [existing] = (await db`
    SELECT * FROM telegram_orders
    WHERE subscription_id = ${subscriptionId} AND customer_chat_id = ${chatId} AND state NOT IN ('sent', 'ready', 'cancelled')
    ORDER BY created_at DESC LIMIT 1
  `) as TelegramOrderRow[];
  if (existing) return { order: existing, isNew: false };

  const [row] = (await db`
    INSERT INTO telegram_orders (subscription_id, customer_chat_id, customer_name, language)
    VALUES (${subscriptionId}, ${chatId}, ${customerName}, ${language})
    RETURNING *
  `) as TelegramOrderRow[];
  return { order: row, isNew: true };
}

async function saveOrder(order: TelegramOrderRow) {
  await sql!`
    UPDATE telegram_orders SET
      state = ${order.state},
      items = ${JSON.stringify(order.items)},
      delivery_type = ${order.delivery_type},
      address = ${order.address},
      total_kzt = ${order.total_kzt},
      payment_file_id = ${order.payment_file_id},
      payment_file_kind = ${order.payment_file_kind},
      payer_name = ${order.payer_name},
      updated_at = now()
    WHERE id = ${order.id}
  `;
}

// Постоянная клавиатура над полем ввода — клиент видит доступные "команды"
// и может нажать вместо печати; заодно и без "/", как обычное сообщение.
const REPLY_KEYBOARD = [["📋 Меню / Мәзір", "❌ Отмена / Бас тарту"]];

async function reply(sub: SubscriptionRow, chatId: number, text: string) {
  await sendTelegramMessageAs(sub.telegram_bot_token!, chatId, text, { replyKeyboard: REPLY_KEYBOARD });
}

async function sendMenuPhotos(sub: SubscriptionRow, chatId: number) {
  for (const url of MENU_PHOTO_URLS) {
    await sendTelegramPhotoAs(sub.telegram_bot_token!, chatId, url, "");
  }
}

export async function processOrderMessage(sub: SubscriptionRow, message: IncomingMessage) {
  if (!sql || !sub.telegram_bot_token || !sub.menu_items) return;

  const text = message.text?.trim() ?? "";
  const lowerText = text.toLowerCase();

  const { order, isNew } = await getOrCreateOrder(
    sub.id,
    message.chatId,
    message.customerName,
    detectLanguage(text || "ru"),
  );
  const t = T[order.language];
  const menu = sub.menu_items;

  if (isNew && !message.fileId) {
    const closedPrefix =
      !isOpenNow(sub) && sub.opens_at && sub.closes_at
        ? t.closedNotice(sub.opens_at.slice(0, 5), sub.closes_at.slice(0, 5))
        : "";
    await reply(sub, message.chatId, closedPrefix + t.greeting());
    if (!text || matchesAny(lowerText, MENU_WORDS)) return;
  }

  if (text && matchesAny(lowerText, CANCEL_WORDS)) {
    order.state = "cancelled";
    await saveOrder(order);
    await reply(sub, message.chatId, t.cancelled());
    return;
  }

  if (text && matchesAny(lowerText, MENU_WORDS)) {
    await sendMenuPhotos(sub, message.chatId);
    await reply(sub, message.chatId, t.menu(formatMenuText(menu)));
    return;
  }

  if (order.state === "collecting") {
    if (!text) {
      await reply(sub, message.chatId, t.fallback());
      return;
    }
    const parsed = await extractOrderItems(menu, text);
    if (!parsed) {
      await reply(sub, message.chatId, t.fallback());
      return;
    }

    if (parsed.items.length > 0) {
      order.items = mergeCart(order.items, parsed.items, menu);
    }
    if (parsed.removeItems.length > 0) {
      order.items = removeFromCart(order.items, parsed.removeItems, menu);
    }
    const cartChanged = parsed.items.length > 0 || parsed.removeItems.length > 0;

    // parsed.unclear значит, что часть сообщения не сопоставилась ни с одной
    // позицией меню — это не должно тонуть молча, даже если другие позиции
    // из того же сообщения добавились успешно (иначе клиент решит, что бот
    // просто проигнорировал часть заказа, и узнает об этом только на кассе).
    const unclearSuffix = parsed.unclear ? t.unclearNote() : "";

    if (parsed.finished) {
      if (order.items.length === 0) {
        await reply(sub, message.chatId, t.emptyCartFinish() + unclearSuffix);
        return;
      }
      order.state = "delivery";
      await saveOrder(order);
      await reply(sub, message.chatId, t.askDelivery(formatCart(order.items), computeTotal(order.items)) + unclearSuffix);
      return;
    }

    if (cartChanged) {
      await saveOrder(order);
      if (order.items.length === 0) {
        await reply(sub, message.chatId, t.emptyCartFinish() + unclearSuffix);
        return;
      }
      await reply(sub, message.chatId, t.itemsAdded(formatCart(order.items), computeTotal(order.items)) + unclearSuffix);
      return;
    }

    if (parsed.unclear) {
      await reply(sub, message.chatId, t.unclearItem(formatMenuText(menu)));
      return;
    }

    // Не про заказ (приветствие/вопрос) — не тратим лишний AI-вызов, просто мягко подталкиваем.
    if (isNew) await sendMenuPhotos(sub, message.chatId);
    await reply(sub, message.chatId, isNew ? t.menu(formatMenuText(menu)) : t.fallback());
    return;
  }

  if (order.state === "delivery") {
    if (!text) {
      await reply(sub, message.chatId, t.askDelivery(formatCart(order.items), computeTotal(order.items)));
      return;
    }
    const isDelivery = matchesAny(lowerText, DELIVERY_WORDS);
    const isPickup = matchesAny(lowerText, PICKUP_WORDS);

    if (isPickup) {
      order.delivery_type = "pickup";
      order.address = null;
      order.total_kzt = computeTotal(order.items);
      order.state = "confirm";
      await saveOrder(order);
      await reply(sub, message.chatId, t.confirm(buildSummary(order, sub)));
      return;
    }

    if (isDelivery) {
      order.delivery_type = "delivery";
      const remainder = text.replace(new RegExp(DELIVERY_WORDS.join("|"), "i"), "").trim();
      if (remainder.length > 5) {
        order.address = remainder;
        order.total_kzt = computeTotal(order.items);
        order.state = "confirm";
        await saveOrder(order);
        await reply(sub, message.chatId, t.confirm(buildSummary(order, sub)));
      } else {
        order.state = "address";
        await saveOrder(order);
        await reply(sub, message.chatId, t.askAddress());
      }
      return;
    }

    await reply(sub, message.chatId, t.askDelivery(formatCart(order.items), computeTotal(order.items)));
    return;
  }

  if (order.state === "address") {
    if (!text) {
      await reply(sub, message.chatId, t.askAddress());
      return;
    }
    order.address = text;
    order.total_kzt = computeTotal(order.items);
    order.state = "confirm";
    await saveOrder(order);
    await reply(sub, message.chatId, t.confirm(buildSummary(order, sub)));
    return;
  }

  if (order.state === "confirm") {
    if (matchesAny(lowerText, YES_WORDS)) {
      order.state = "payment";
      await saveOrder(order);
      await reply(sub, message.chatId, t.paymentAsk(sub.kaspi_requisites ?? "уточните реквизиты у администратора"));
      return;
    }
    if (matchesAny(lowerText, NO_WORDS)) {
      order.state = "collecting";
      await saveOrder(order);
      await reply(sub, message.chatId, t.backToEdit());
      return;
    }
    await reply(sub, message.chatId, t.confirm(buildSummary(order, sub)));
    return;
  }

  if (order.state === "payment") {
    // Имя (для сверки с Kaspi-переводом) и чек могут прийти в любом порядке
    // и отдельными сообщениями — принимаем оба независимо. Но только ПЕРВОЕ
    // текстовое сообщение здесь считаем именем: раньше любое следующее
    // сообщение (вопрос, жалоба, уточнение) молча перезаписывало имя и в
    // ответ уходило то же самое "принял, спасибо" — снаружи выглядело так,
    // будто бот вообще не отвечает на вопросы. Теперь второй и далее текст
    // без файла пересылаем владельцу как есть, а не притворяемся, что поняли.
    if (text && !message.fileId) {
      if (!order.payer_name) {
        order.payer_name = text;
        await saveOrder(order);
        await reply(sub, message.chatId, t.payerNameSaved());
        return;
      }

      if (sub.telegram_owner_chat_id) {
        await sendTelegramMessageAs(
          sub.telegram_bot_token,
          sub.telegram_owner_chat_id,
          `💬 Сообщение от клиента по заказу (${sub.business_name}, чат ${message.chatId}):\n${text}`,
        );
      }
      await reply(sub, message.chatId, t.paymentQuestionForwarded());
      return;
    }

    if (!message.fileId) {
      await reply(sub, message.chatId, t.paymentReminder());
      return;
    }

    order.payment_file_id = message.fileId;
    order.payment_file_kind = message.fileKind ?? "photo";
    // Если клиент не назвал имя явно — берём подпись к фото/файлу, если он
    // написал имя туда, иначе имя из профиля Telegram (лучше приблизительно, чем никак).
    if (!order.payer_name) order.payer_name = text || message.customerName;
    order.state = "sent";
    await saveOrder(order);
    await reply(sub, message.chatId, t.orderSent());

    const caption = buildOwnerNotification(order, sub);
    const readyKeyboard = [[{ text: "✅ Заказ готов", callback_data: `ready:${order.id}` }]];
    const ownerChatId = sub.telegram_owner_chat_id;
    if (ownerChatId) {
      if (order.payment_file_kind === "document") {
        await sendTelegramDocumentAs(sub.telegram_bot_token, ownerChatId, message.fileId, caption, readyKeyboard);
      } else {
        await sendTelegramPhotoAs(sub.telegram_bot_token, ownerChatId, message.fileId, caption, readyKeyboard);
      }
    } else {
      // Владелец ещё не привязал аккаунт (/start link_...) — не теряем заказ,
      // шлём агентству, чтобы переслали вручную и напомнили привязать. Кнопку
      // "готово" сюда не прикрепляем — это чужой бот, callback не обработает.
      await notifyOwner(
        `⚠️ У подписки "${sub.business_name}" (owner_id ${sub.owner_id}) владелец ещё не привязал Telegram — заказ не смог дойти напрямую.\n\n${caption}`,
      );
    }
    return;
  }
}

/** Обрабатывает нажатие inline-кнопки владельцем под уведомлением о заказе
 * (пока только "Заказ готов") — возвращает текст всплывающей подсказки для
 * answerCallbackQuery. */
export async function handleOwnerCallback(sub: SubscriptionRow, data: string): Promise<string> {
  const match = /^ready:(\d+)$/.exec(data);
  if (!match || !sql || !sub.telegram_bot_token) return "Не получилось";

  const [order] = (await sql`
    SELECT * FROM telegram_orders WHERE id = ${Number(match[1])} AND subscription_id = ${sub.id}
  `) as TelegramOrderRow[];
  if (!order) return "Заказ не найден";
  if (order.state === "ready") return "Уже отмечено готовым";

  await sql`UPDATE telegram_orders SET state = 'ready', updated_at = now() WHERE id = ${order.id}`;

  const t = T[order.language];
  await sendTelegramMessageAs(
    sub.telegram_bot_token,
    order.customer_chat_id,
    order.delivery_type === "delivery" ? t.orderReadyDelivery() : t.orderReadyPickup(),
  );

  return "Клиент уведомлён ✅";
}

function buildSummary(order: TelegramOrderRow, sub: SubscriptionRow): string {
  const cartText = formatCart(order.items);
  const total = computeTotal(order.items);
  const deliveryText =
    order.delivery_type === "delivery" ? `🚚 Доставка: ${order.address}` : `🏃 Самовывоз из ${sub.business_name}`;
  return `🧾 Проверьте, пожалуйста, заказ:\n\n${cartText}\n\n${deliveryText}\n\n💰 Итого: ${total.toLocaleString("ru-RU")} ₸`;
}

function buildOwnerNotification(order: TelegramOrderRow, sub: SubscriptionRow): string {
  const cartText = formatCart(order.items);
  const total = computeTotal(order.items);
  const deliveryText = order.delivery_type === "delivery" ? `Доставка: ${order.address}` : `Самовывоз`;
  const customer = order.customer_name ? `${order.customer_name} (чат ${order.customer_chat_id})` : `чат ${order.customer_chat_id}`;
  const payerLine = order.payer_name ? `\n👤 Имя в Kaspi: ${order.payer_name}` : "";
  return `🔔 Новый заказ — ${sub.business_name}\n\nОт: ${customer}${payerLine}\n\n${cartText}\n\n${deliveryText}\nИтого: ${total.toLocaleString("ru-RU")} ₸\n\n💳 Чек — во вложении. Проверьте перевод, сверьте имя и начинайте готовить. Когда готово — нажмите кнопку ниже.`;
}
