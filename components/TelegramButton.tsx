"use client";

import { track } from "@vercel/analytics";

const TELEGRAM_BOT_USERNAME = "BusinessAI_auto_bot";

export default function TelegramButton({
  className = "",
  children = "Написать в Telegram",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=site`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("telegram_click")}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#26A5E4] px-5 py-2.5 text-sm font-medium text-white transition-all hover:scale-[1.03] hover:bg-[#1e8fc7] active:scale-[0.98] ${className}`}
    >
      <span aria-hidden="true">✈️</span>
      {children}
    </a>
  );
}
