import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPortalSessionToken } from "@/lib/portalAuth";
import { sql, type SubscriptionRow } from "@/lib/db";
import PromptSettingsForm from "@/components/portal/PromptSettingsForm";

export const dynamic = "force-dynamic";

export default async function PortalSettingsPage() {
  const secret = process.env.PORTAL_SESSION_SECRET;
  const token = (await cookies()).get("portal_session")?.value;
  const subscriptionId = secret ? await verifyPortalSessionToken(token, secret) : null;

  if (!subscriptionId || !sql) {
    redirect("/portal/login");
  }

  const [sub] = (await sql`SELECT * FROM subscriptions WHERE id = ${subscriptionId}`) as SubscriptionRow[];
  if (!sub) {
    redirect("/portal/login");
  }

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Link href="/portal" className="text-sm text-muted hover:text-foreground">
          ← Назад в кабинет
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Настройки бота</h1>
        <p className="mt-1 text-sm text-muted">{sub.business_name}</p>

        <div className="mt-8">
          <PromptSettingsForm
            initialPrompt={sub.system_prompt}
            initialOpensAt={sub.opens_at?.slice(0, 5) ?? ""}
            initialClosesAt={sub.closes_at?.slice(0, 5) ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
