"use client";

import { track } from "@vercel/analytics";
import { buildWhatsAppLink } from "@/lib/whatsapp";

export default function WhatsAppFloat() {
  return (
    <a
      href={buildWhatsAppLink("Здравствуйте! Хочу узнать подробнее про ИИ-автоматизацию.")}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("whatsapp_float_click")}
      aria-label="Написать в WhatsApp"
      className="motion-reduce:animate-none fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-2xl text-white shadow-lg shadow-black/30 transition-transform hover:scale-110 active:scale-95"
      style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <span className="motion-reduce:hidden absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-60" />
      <span aria-hidden="true" className="relative">💬</span>
    </a>
  );
}
