// Проверка получения 8-значного pairing-кода WhatsApp в консоли.
// Запуск: npm run test-wa -- <ownerId> <phoneNumber>
//   npm run test-wa -- owner_1 77001234567
// phoneNumber — ваш реальный номер WhatsApp в международном формате, без "+".

import { initWhatsApp } from "../src/whatsapp";

const ownerId = process.argv[2] ?? "owner_1";
const phoneNumber = process.argv[3] ?? "7700XXXXXXX";

if (phoneNumber === "7700XXXXXXX") {
  console.log(
    "Укажите свой реальный номер WhatsApp: npm run test-wa -- owner_1 <ваш номер>"
  );
  process.exit(1);
}

initWhatsApp(ownerId, phoneNumber).then(({ pairingCode }) => {
  console.log("Pairing code:", pairingCode);
});
