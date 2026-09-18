import Link from "next/link";
import TelegramButton from "./TelegramButton";
import WhatsAppButton from "./WhatsAppButton";

const navLinks = [
  { href: "#products", label: "Продукты" },
  { href: "#faq", label: "FAQ" },
];

export default function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-5 sm:gap-4 sm:px-6">
        <span className="font-display text-base font-bold tracking-tight sm:text-lg">
          Автопилот<span className="text-accent">.AI</span>
        </span>
        <nav className="hidden items-center gap-6 sm:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-3 sm:flex">
            <WhatsAppButton />
            <TelegramButton />
          </div>
          <a
            href="#lead-form"
            className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90 sm:px-5 sm:py-2 sm:text-sm"
          >
            Оставить заявку
          </a>
          <Link
            href="/portal/login"
            className="shrink-0 rounded-full border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent shadow-[0_0_14px_rgba(255,90,54,0.45)] transition-all hover:bg-accent/20 hover:shadow-[0_0_20px_rgba(255,90,54,0.65)] sm:px-4 sm:py-2 sm:text-sm"
          >
            Личный кабинет
          </Link>
        </div>
      </div>
    </header>
  );
}
