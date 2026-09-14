#!/usr/bin/env node
// Обёртка-надзиратель над group-listener.mjs: если он упал (сетевой сбой,
// необработанная ошибка и т.п.) — сам перезапускает его через паузу.
// Ручная остановка (Ctrl+C) перезапуском не считается — просто завершается.
//
// Ничего не пишет в Telegram при падении/перезапуске — только в консоль.
// Статус (жив ли юзербот сейчас) узнаётся исключительно по запросу — команда
// /status боту в личке, см. buildStatusText в lib/telegramBot.ts. Так и
// задумано: никаких самопроизвольных уведомлений о перезапусках.
//
// Запуск: npm run group-listener (эта обёртка и есть точка входа теперь).

import { spawn } from "node:child_process";

const MAX_RESTARTS_IN_WINDOW = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 минут
const BASE_DELAY_MS = 5000;

let restartTimestamps = [];
let stoppedManually = false;
let child = null;

function startChild() {
  console.log("[supervisor] Запускаю group-listener.mjs...");
  child = spawn(process.execPath, ["--env-file=.env.local", "scripts/group-listener.mjs"], {
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (stoppedManually) return;

    const now = Date.now();
    restartTimestamps = restartTimestamps.filter((t) => now - t < WINDOW_MS);
    restartTimestamps.push(now);

    if (restartTimestamps.length > MAX_RESTARTS_IN_WINDOW) {
      console.error(
        `[supervisor] Слишком много падений подряд (${restartTimestamps.length} за ` +
          `${Math.round(WINDOW_MS / 60000)} мин) — останавливаюсь, чтобы не зациклиться. ` +
          "Проверьте вывод выше и запустите заново вручную: npm run group-listener",
      );
      process.exit(1);
    }

    const delay = BASE_DELAY_MS * Math.min(restartTimestamps.length, 6);
    console.error(
      `[supervisor] group-listener.mjs завершился (код ${code ?? "—"}, сигнал ${signal ?? "—"}). ` +
        `Перезапуск через ${Math.round(delay / 1000)} сек...`,
    );
    setTimeout(startChild, delay);
  });
}

process.on("SIGINT", () => {
  stoppedManually = true;
  console.log("\n[supervisor] Останавливаю...");
  if (child) child.kill("SIGINT");
  setTimeout(() => process.exit(0), 500);
});

startChild();
