// PM2 process manager config — запускается на VPS командой `pm2 start ecosystem.config.js`.
// Держит два процесса: Next.js-сайт (web) и постоянный многопользовательский
// WhatsApp-демон (wa-daemon, ведёт бота на каждую активную подписку).
//
// Секреты (DATABASE_URL, INTERNAL_BRIDGE_SECRET, TELEGRAM_*, GEMINI_API_KEY,
// KASPI_REQUISITES_TEXT и т.д.) сюда не прописываем — они читаются из
// .env.local на сервере (Next.js подхватывает его сам для web; для
// wa-daemon грузим явно через node --env-file, см. ниже). Файл .env.local
// в git не коммитим, на сервер кладём вручную/через scp.
module.exports = {
  apps: [
    {
      name: "web",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "wa-daemon",
      script: "node",
      args: "--env-file=.env.local scripts/.build/wa-daemon.mjs",
      env: {
        NODE_ENV: "production",
      },
      // Baileys сам переподключается с бэкоффом (см. src/whatsapp.ts) —
      // это перезапуск только на случай, если процесс упадёт целиком.
      autorestart: true,
      restart_delay: 5000,
    },
  ],
};
