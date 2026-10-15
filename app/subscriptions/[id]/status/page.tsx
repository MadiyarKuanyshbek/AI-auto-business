import Link from "next/link";
import { notFound } from "next/navigation";
import { sql, type SubscriptionRow } from "@/lib/db";
import SubscriptionStatusPoller from "@/components/SubscriptionStatusPoller";

export const dynamic = "force-dynamic";

export default async function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subId = Number(id);
  if (!Number.isInteger(subId) || !sql) notFound();

  const [sub] = (await sql`
    SELECT status, pairing_code, current_period_end, channel, owner_id, telegram_bot_username, telegram_owner_chat_id, paid_at, price_kzt
    FROM subscriptions WHERE id = ${subId}
  `) as Pick<
    SubscriptionRow,
    "status" | "pairing_code" | "current_period_end" | "channel" | "owner_id" | "telegram_bot_username" | "telegram_owner_chat_id" | "paid_at" | "price_kzt"
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

        {sub.channel === "telegram" && sub.status === "active" && (
          <div className="mt-6 rounded-2xl border border-border bg-white/5 p-5 text-sm">
            {sub.paid_at ? (
              <p>Подписка оплачена. Бот работает.</p>
            ) : (
              <>
                <p className="font-medium">Пробный период — 7 дней бесплатно</p>
                <p className="mt-1 text-muted">
                  Действует до{" "}
                  {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("ru-RU") : "—"}. Чтобы бот
                  не остановился, оплатите подписку заранее — {sub.price_kzt.toLocaleString("ru-RU")} ₸/мес.
                </p>
                <Link
                  href={`/subscriptions/${subId}/pay`}
                  className="mt-3 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground"
                >
                  Оплатить сейчас
                </Link>
              </>
            )}
            <p className="mt-3 text-muted">
              Личный кабинет:{" "}
              <Link href="/portal/login" className="underline">
                войти по номеру и паролю
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
