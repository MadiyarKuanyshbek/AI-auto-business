import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalSubscription } from "@/lib/portalSession";
import SetupWizard from "@/components/portal/SetupWizard";

export const dynamic = "force-dynamic";

export default async function PortalSetupPage() {
  const sub = await getPortalSubscription();
  if (!sub) redirect("/portal/login");

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link href="/portal" className="text-sm text-muted hover:text-foreground">
          ← В личный кабинет
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Настройка бота</h1>
        <p className="mt-1 text-sm text-muted">{sub.business_name} · займёт 3 минуты</p>

        <div className="mt-8">
          <SetupWizard
            botUsername={sub.telegram_bot_username}
            deepLink={
              sub.telegram_bot_username ? `https://t.me/${sub.telegram_bot_username}?start=link_${sub.owner_id}` : null
            }
            telegramLinked={sub.telegram_owner_chat_id !== null}
            initialKaspi={sub.kaspi_requisites ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
