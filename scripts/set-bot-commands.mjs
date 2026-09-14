#!/usr/bin/env node
// Регистрирует автодополнение команд бота (всплывает при вводе "/" в чате).
// Владельческие команды регистрируются только для чата TELEGRAM_CHAT_ID
// (BotCommandScopeChat) — клиенты бота их в автодополнении не увидят.
// Разовый скрипт, перезапускать нужно только если список команд поменялся.
// Использование: node --env-file=.env.local scripts/set-bot-commands.mjs

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const ownerChatId = process.env.TELEGRAM_CHAT_ID;

if (!botToken || !ownerChatId) {
  console.error("Нужны TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env.local");
  process.exit(1);
}

async function setCommands(commands, scope) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands, scope }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`setMyCommands failed: ${JSON.stringify(data)}`);
}

async function main() {
  // Публичные — видны всем, кто пишет боту.
  await setCommands([{ command: "start", description: "Начать / список продуктов" }]);

  // Владельческие — видны только в чате владельца с ботом.
  await setCommands(
    [
      { command: "status", description: "Сводка по всей системе" },
      { command: "leads", description: "Новые заявки (с кнопками статуса)" },
      { command: "found", description: "Топ бизнесов из автопоиска" },
      { command: "groups", description: "Заказы из Telegram-групп" },
      { command: "suggest", description: "Подсказчик ответов клиенту" },
      { command: "suggest_off", description: "Выключить подсказчик" },
      { command: "help", description: "Список команд" },
    ],
    { type: "chat", chat_id: Number(ownerChatId) },
  );

  console.log("Готово: команды зарегистрированы (публичные + для чата владельца).");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
