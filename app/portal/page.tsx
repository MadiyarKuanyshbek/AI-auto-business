import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPortalSessionToken } from "@/lib/portalAuth";
import { sql, type SubscriptionRow } from "@/lib/db";
import { products } from "@/lib/products";
import PortalLogoutButton from "@/components/portal/PortalLogoutButton";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Ждём оплату",
  active: "Активна",
  expired: "Истекла",
  cancelled: "Отменена",
};

export default async function PortalPage() {
  const secret = process.env.PORTAL_SESSION_SECRET;
  const token = (await cookies()).get("portal_session")?.value;
  const subscriptionId = secret ? await verifyPortalSessionToken(token, secret) : null;

  if (!subscriptionId) {
    redirect("/portal/login");
  }
  if (!sql) {
    redirect("/portal/login");
  }

  const [sub] = (await sql`SELECT * FROM subscriptions WHERE id = ${subscriptionId}`) as SubscriptionRow[];
  if (!sub) {
    redirect("/portal/login");
  }

  const productLabel = products.find((p) => p.id === sub.product_id)?.title ?? sub.product_id;
  const needsRenewal = sub.status === "expired" || sub.status === "pending_payment";

  let botStatus: "connected" | "connecting" | "not_started" | "unknown" = "unknown";
  if (sub.status === "active" && sub.channel === "whatsapp") {
    try {
      const bridgeUrl = process.env.WA_BRIDGE_URL ?? "http://127.0.0.1:4001";
      const secret = process.env.INTERNAL_BRIDGE_SECRET;
      const response = await fetch(`${bridgeUrl}/bots/${sub.owner_id}/status`, {
        headers: { "X-Internal-Secret": secret ?? "" },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (response.ok) {
        botStatus = (await response.json()).status;
      }
    } catch {
      // Демон недоступен (например, локальная разработка) — просто не покажем статус.
    }
  } else if (sub.status === "active" && sub.channel === "telegram") {
    // У Telegram-бота нет отдельного демона — если вебхук зарегистрирован
    // (см. подключение), бот всегда "подключён", промежуточных статусов нет.
    botStatus = sub.telegram_bot_token ? "connected" : "not_started";
  }

  const BOT_STATUS_LABELS: Record<string, string> = {
    connected: "🟢 Подключён",
    connecting: "🟡 Подключается",
    not_started: "⚪ Не запущен",
    unknown: "—",
  };

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Личный кабинет</h1>
          <PortalLogoutButton />
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-white/5 p-6">
          <p className="text-sm text-muted">{sub.business_name}</p>
          <p className="mt-1 text-lg font-semibold">{productLabel}</p>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted">Статус</span>
            <span className="font-medium">{STATUS_LABELS[sub.status] ?? sub.status}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted">Стоимость</span>
            <span className="font-medium">{sub.price_kzt.toLocaleString("ru-RU")} ₸/мес</span>
          </div>
          {sub.current_period_end && (
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted">Действует до</span>
              <span className="font-medium">{new Date(sub.current_period_end).toLocaleDateString("ru-RU")}</span>
            </div>
          )}
          {sub.status === "active" && (
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted">Бот в {sub.channel === "telegram" ? "Telegram" : "WhatsApp"}</span>
              <span className="font-medium">{BOT_STATUS_LABELS[botStatus]}</span>
            </div>
          )}
        </div>

        {sub.channel === "telegram" && (
          <Link
            href="/portal/orders"
            className="mt-4 block w-full rounded-full border border-border px-6 py-3 text-center text-sm font-semibold transition-colors hover:bg-white/5"
          >
            Заказы
          </Link>
        )}

        <Link
          href="/portal/settings"
          className="mt-3 block w-full rounded-full border border-border px-6 py-3 text-center text-sm font-semibold transition-colors hover:bg-white/5"
        >
          Настройки бота
        </Link>

        {needsRenewal && (
          <Link
            href={`/subscriptions/${sub.id}/pay`}
            className="mt-3 block w-full rounded-full bg-accent px-6 py-3 text-center text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Продлить подписку
          </Link>
        )}
      </div>
    </div>
  );
}
