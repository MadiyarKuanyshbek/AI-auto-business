"use client";

import { track } from "@vercel/analytics";
import { buildWhatsAppLink } from "@/lib/whatsapp";

export default function WhatsAppButton({
  message = "Здравствуйте! Хочу узнать подробнее про ИИ-автоматизацию.",
  className = "",
  children = "Написать в WhatsApp",
}: {
  message?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={buildWhatsAppLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("whatsapp_click")}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1ebe5a] ${className}`}
    >
      <span aria-hidden="true">💬</span>
      {children}
    </a>
  );
}
