import { sql, type MenuItem, type OrderItem, type OrderLanguage, type SubscriptionRow, type TelegramOrderRow } from "@/lib/db";
import { sendTelegramMessageAs, sendTelegramPhotoAs, notifyOwner } from "@/lib/telegram";
import { generateJsonReply } from "@/src/gemini";

type IncomingMessage = {
  text?: string;
  photoFileId?: string;
  chatId: number;
  customerName: string | null;
};

const KZ_CHARS = /[әғқңөұүһі]/i;
function detectLanguage(text: string): OrderLanguage {
  return KZ_CHARS.test(text) ? "kz" : "ru";
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
  return items.map((item) => `• ${item.qty} × ${item.name} — ${(item.price * item.qty).toLocaleString("ru-RU")} ₸`).join("\n");
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

const T = {
  ru: {
    greeting: () =>
      `Здравствуйте! 🌯 Это Doner Mangalo.\n\nНапишите, что хотите заказать (например: «2 донера говяжьих в лаваше и картошку»). Полное меню — командой /menu.`,
    menu: (menuText: string) => `📋 Меню:\n\n${menuText}\n\nНапишите, что и сколько хотите заказать.`,
    itemsAdded: (cartText: string, total: number) =>
      `Добавил в заказ:\n${cartText}\n\nИтого: ${total.toLocaleString("ru-RU")} ₸\n\nЕщё что-нибудь? Если всё — напишите «всё» или «оформляйте».`,
    unclearItem: (menuText: string) =>
      `Не нашёл такую позицию в меню 🤔 Вот что у нас есть:\n\n${menuText}\n\nНапишите название блюда точнее.`,
    emptyCartFinish: () => `Похоже, заказ пока пустой. Что будете заказывать?`,
    askDelivery: (cartText: string, total: number) =>
      `Ваш заказ:\n${cartText}\n\nИтого: ${total.toLocaleString("ru-RU")} ₸\n\nСамовывоз или доставка? Если доставка — сразу напишите адрес.`,
    askAddress: () => `На какой адрес доставить заказ?`,
    confirm: (summary: string) => `${summary}\n\nВсё верно? Напишите «да», чтобы отправить заказ в оплату, или «нет», если нужно что-то изменить.`,
    backToEdit: () => `Хорошо, что изменить? Напишите нужные позиции заново.`,
    paymentAsk: (requisites: string) =>
      `Отлично! Для оплаты переведите сумму на Kaspi:\n${requisites}\n\nПосле перевода пришлите, пожалуйста, скриншот чека сюда фото — и заказ сразу уйдёт на кухню.`,
    paymentReminder: () => `Жду скриншот перевода — просто пришлите его сюда фото.`,
    orderSent: () => `Спасибо! Заказ и чек отправлены — как только подтвердим оплату, начнём готовить. 🙏`,
    cancelled: () => `Заказ отменён. Напишите в любой момент, если захотите оформить новый.`,
    fallback: () => `Извините, не совсем понял 🙏 Напишите /menu чтобы увидеть меню, или опишите заказ подробнее.`,
  },
  kz: {
    greeting: () =>
      `Сәлеметсіз бе! 🌯 Бұл Doner Mangalo.\n\nНе тапсырыс бергіңіз келетінін жазыңыз (мысалы: «2 сиыр донер лавашта және картоп фри»). Толық мәзір — /menu.`,
    menu: (menuText: string) => `📋 Мәзір:\n\n${menuText}\n\nНе және қанша керек екенін жазыңыз.`,
    itemsAdded: (cartText: string, total: number) =>
      `Тапсырысқа қостым:\n${cartText}\n\nБарлығы: ${total.toLocaleString("ru-RU")} ₸\n\nТағы бірдеңе керек пе? Болса — «болды» немесе «рәсімдеңіз» деп жазыңыз.`,
    unclearItem: (menuText: string) =>
      `Мұндай тағамды мәзірден таппадым 🤔 Мәзір:\n\n${menuText}\n\nАтауын нақтырақ жазыңыз.`,
    emptyCartFinish: () => `Тапсырыс әлі бос сияқты. Не тапсырасыз?`,
    askDelivery: (cartText: string, total: number) =>
      `Тапсырысыңыз:\n${cartText}\n\nБарлығы: ${total.toLocaleString("ru-RU")} ₸\n\nӨзіңіз алып кетесіз бе, әлде жеткізу керек пе? Жеткізу болса — мекенжайды жазыңыз.`,
    askAddress: () => `Қай мекенжайға жеткізу керек?`,
    confirm: (summary: string) => `${summary}\n\nБәрі дұрыс па? Төлемге жіберу үшін «иә» деп жазыңыз, өзгерту керек болса — «жоқ».`,
    backToEdit: () => `Жарайды, нені өзгерту керек? Керекті позицияларды қайта жазыңыз.`,
    paymentAsk: (requisites: string) =>
      `Тамаша! Төлеу үшін Kaspi-ға аударыңыз:\n${requisites}\n\nАударғаннан кейін, өтінемін, чек скриншотын осында фото түрінде жіберіңіз — тапсырыс бірден дайындалуға кетеді.`,
    paymentReminder: () => `Аударым скриншотын күтіп тұрмын — осында фото жіберіңіз.`,
    orderSent: () => `Рахмет! Тапсырыс пен чек жіберілді — төлем расталған соң дайындай бастаймыз. 🙏`,
    cancelled: () => `Тапсырыс тоқтатылды. Кез келген уақытта жаңа тапсырыс беруге жазыңыз.`,
    fallback: () => `Кешіріңіз, толық түсінбедім 🙏 Мәзірді көру үшін /menu жазыңыз немесе тапсырысты толығырақ сипаттаңыз.`,
  },
};

type ParsedOrder = { items: { name: string; qty: number }[]; finished: boolean; unclear: boolean };

async function extractOrderItems(menu: MenuItem[], userMessage: string): Promise<ParsedOrder | null> {
  const prompt = `Ты — ассистент, который разбирает сообщение клиента точки быстрого питания и определяет, какие позиции меню и в каком количестве он хочет заказать.

Меню (точные названия и цены в тенге):
${formatMenuText(menu)}

Правила:
- Перечисли В ПОЛНОМ ОБЪЁМЕ все позиции, упомянутые в сообщении, — не пропускай ни одной, даже если их несколько.
- В поле "items" перечисли только те позиции, которые есть в меню выше, используя ТОЧНОЕ название из списка (символ в символ).
- Будь ОСОБЕННО внимателен к виду мяса — "говяжий", "куриный" и "ассорти" это РАЗНЫЕ позиции, не путай их между собой.
- Если количество явно не указано — считай его равным 1.
- Если клиент говорит, что закончил заказ ("всё", "это всё", "больше ничего", "оформляйте", "хватит", "давай оформляй", "болды") — поставь "finished": true.
- Если упомянутое блюдо не удаётся уверенно сопоставить ни с одной позицией меню — не добавляй его в items и поставь "unclear": true.
- Если сообщение вообще не про заказ (приветствие, вопрос и т.п.) — верни пустой items, finished:false, unclear:false.

Пример:
Сообщение: "2 донера куриных в лаваше и картошку фри"
Ответ: {"items": [{"name": "Донер куриный в лаваше", "qty": 2}, {"name": "Картофель фри с соусом", "qty": 1}], "finished": false, "unclear": false}

Ответь СТРОГО в формате JSON без пояснений, всегда включай поле "items" (пустой массив [], если позиций нет):
{"items": [{"name": "точное название из меню", "qty": число}], "finished": boolean, "unclear": boolean}`;

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
    finished: raw.finished === true,
    unclear: raw.unclear === true,
  };
}

async function getOrCreateOrder(subscriptionId: number, chatId: number, customerName: string | null, language: OrderLanguage) {
  // sql гарантированно не null — единственный вызывающий (processOrderMessage) проверяет это раньше.
  const db = sql!;
  const [existing] = (await db`
    SELECT * FROM telegram_orders
    WHERE subscription_id = ${subscriptionId} AND customer_chat_id = ${chatId} AND state NOT IN ('sent', 'cancelled')
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
      updated_at = now()
    WHERE id = ${order.id}
  `;
}

async function reply(sub: SubscriptionRow, chatId: number, text: string) {
  await sendTelegramMessageAs(sub.telegram_bot_token!, chatId, text);
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

  if (isNew && !message.photoFileId) {
    await reply(sub, message.chatId, t.greeting());
    if (!text || matchesAny(lowerText, MENU_WORDS)) return;
  }

  if (text && matchesAny(lowerText, CANCEL_WORDS)) {
    order.state = "cancelled";
    await saveOrder(order);
    await reply(sub, message.chatId, t.cancelled());
    return;
  }

  if (text && matchesAny(lowerText, MENU_WORDS)) {
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

    if (parsed.finished) {
      if (order.items.length === 0) {
        await reply(sub, message.chatId, t.emptyCartFinish());
        return;
      }
      order.state = "delivery";
      await saveOrder(order);
      await reply(sub, message.chatId, t.askDelivery(formatCart(order.items), computeTotal(order.items)));
      return;
    }

    if (parsed.items.length > 0) {
      await saveOrder(order);
      await reply(sub, message.chatId, t.itemsAdded(formatCart(order.items), computeTotal(order.items)));
      return;
    }

    if (parsed.unclear) {
      await reply(sub, message.chatId, t.unclearItem(formatMenuText(menu)));
      return;
    }

    // Не про заказ (приветствие/вопрос) — не тратим лишний AI-вызов, просто мягко подталкиваем.
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
    if (!message.photoFileId) {
      await reply(sub, message.chatId, t.paymentReminder());
      return;
    }
    order.payment_file_id = message.photoFileId;
    order.state = "sent";
    await saveOrder(order);
    await reply(sub, message.chatId, t.orderSent());

    const caption = buildOwnerNotification(order, sub);
    const ownerChatId = sub.telegram_owner_chat_id;
    if (ownerChatId) {
      await sendTelegramPhotoAs(sub.telegram_bot_token, ownerChatId, message.photoFileId, caption);
    } else {
      // Владелец ещё не привязал аккаунт (/start link_...) — не теряем заказ,
      // шлём агентству, чтобы переслали вручную и напомнили привязать.
      await notifyOwner(
        `⚠️ У подписки "${sub.business_name}" (owner_id ${sub.owner_id}) владелец ещё не привязал Telegram — заказ не смог дойти напрямую.\n\n${caption}`,
      );
    }
    return;
  }
}

function buildSummary(order: TelegramOrderRow, sub: SubscriptionRow): string {
  const cartText = formatCart(order.items);
  const total = computeTotal(order.items);
  const deliveryText =
    order.delivery_type === "delivery" ? `🚚 Доставка: ${order.address}` : `🏃 Самовывоз из ${sub.business_name}`;
  return `Ваш заказ:\n${cartText}\n\n${deliveryText}\n\nИтого: ${total.toLocaleString("ru-RU")} ₸`;
}

function buildOwnerNotification(order: TelegramOrderRow, sub: SubscriptionRow): string {
  const cartText = formatCart(order.items);
  const total = computeTotal(order.items);
  const deliveryText = order.delivery_type === "delivery" ? `Доставка: ${order.address}` : `Самовывоз`;
  const customer = order.customer_name ? `${order.customer_name} (чат ${order.customer_chat_id})` : `чат ${order.customer_chat_id}`;
  return `🔔 Новый заказ — ${sub.business_name}\n\nОт: ${customer}\n\n${cartText}\n\n${deliveryText}\nИтого: ${total.toLocaleString("ru-RU")} ₸\n\n💳 Скриншот оплаты — во вложении. Проверьте перевод и начинайте готовить.`;
}
