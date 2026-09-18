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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <span className="font-display text-lg font-bold tracking-tight">
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
        <div className="flex items-center gap-3">
          <Link
            href="/portal/login"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-foreground sm:block"
          >
            Личный кабинет
          </Link>
          <div className="hidden items-center gap-3 sm:flex">
            <WhatsAppButton />
            <TelegramButton />
          </div>
          <a
            href="#lead-form"
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Оставить заявку
          </a>
        </div>
      </div>
    </header>
  );
}
