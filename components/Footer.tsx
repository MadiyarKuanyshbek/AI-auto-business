import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto max-w-6xl px-6 text-center text-sm text-muted">
        <Link href="/admin" className="no-underline hover:no-underline">
          © {new Date().getFullYear()} Автопилот.AI
        </Link>
      </div>
    </footer>
  );
}
