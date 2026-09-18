import Link from "next/link";
import LogoutButton from "./LogoutButton";

const TABS = [
  { href: "/admin", label: "Непринятые заявки" },
  { href: "/admin/accepted", label: "Принятые заявки" },
  { href: "/admin/companies", label: "Компании (новые)" },
  { href: "/admin/companies/viewed", label: "Компании (просмотрено)" },
  { href: "/admin/subscriptions", label: "Подписки" },
  { href: "/admin/groups", label: "Заказы из Telegram-групп" },
];

export default function AdminSidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col justify-between border-r border-black/10 bg-white px-4 py-6 dark:border-white/10 dark:bg-zinc-950">
      <div>
        <Link href="/" className="block px-2 text-sm font-semibold text-zinc-900 dark:text-white">
          Автопилот.AI
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-black/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-3 border-t border-black/10 px-2 pt-4 dark:border-white/10">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
          ← На сайт
        </Link>
        <LogoutButton />
      </div>
    </aside>
  );
}
