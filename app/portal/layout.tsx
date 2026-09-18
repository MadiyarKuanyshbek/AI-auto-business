import Link from "next/link";

// Общий тонкий хедер для всех /portal/* страниц — раньше на главную сайта
// отсюда попасть было нельзя вообще (ни логотипа, ни ссылки).
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="font-display text-base font-bold tracking-tight transition-opacity hover:opacity-80">
            Автопилот<span className="text-accent">.AI</span>
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
