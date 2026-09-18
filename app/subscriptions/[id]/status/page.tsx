import { notFound } from "next/navigation";
import { sql, type SubscriptionRow } from "@/lib/db";
import SubscriptionStatusPoller from "@/components/SubscriptionStatusPoller";

export const dynamic = "force-dynamic";

export default async function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subId = Number(id);
  if (!Number.isInteger(subId) || !sql) notFound();

  const [sub] = (await sql`
    SELECT status, pairing_code, current_period_end, channel, owner_id, telegram_bot_username, telegram_owner_chat_id
    FROM subscriptions WHERE id = ${subId}
  `) as Pick<
    SubscriptionRow,
    "status" | "pairing_code" | "current_period_end" | "channel" | "owner_id" | "telegram_bot_username" | "telegram_owner_chat_id"
  >[];
  if (!sub) notFound();

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Статус подключения</h1>
        <div className="mt-6">
          <SubscriptionStatusPoller
            subscriptionId={subId}
            initial={{
              status: sub.status,
              pairingCode: sub.pairing_code,
              currentPeriodEnd: sub.current_period_end,
              channel: sub.channel,
              telegramBotUsername: sub.telegram_bot_username,
              telegramLinked: sub.telegram_owner_chat_id !== null,
              telegramDeepLink: sub.telegram_bot_username
                ? `https://t.me/${sub.telegram_bot_username}?start=link_${sub.owner_id}`
                : null,
            }}
          />
        </div>
      </div>
    </div>
  );
}
