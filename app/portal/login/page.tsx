import Link from "next/link";
import PortalLoginForm from "@/components/portal/PortalLoginForm";

export const dynamic = "force-dynamic";

export default function PortalLoginPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Личный кабинет</h1>
        <p className="mt-2 text-sm text-muted">Вход по номеру, который вы указали при подключении бота (WhatsApp или Telegram).</p>
        <div className="mt-8">
          <PortalLoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Ещё нет бота?{" "}
          <Link href="/#products" className="font-medium text-accent hover:underline">
            Подключить и зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
