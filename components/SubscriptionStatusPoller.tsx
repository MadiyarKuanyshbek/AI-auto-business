"use client";

import { useEffect, useState } from "react";

type Status = "pending_payment" | "active" | "expired" | "cancelled";

type StatusResponse = {
  status: Status;
  pairingCode: string | null;
  currentPeriodEnd: string | null;
};

export default function SubscriptionStatusPoller({
  subscriptionId,
  initial,
}: {
  subscriptionId: number;
  initial: StatusResponse;
}) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    if (data.status !== "pending_payment" && data.status !== "active") return;
    if (data.status === "active" && data.pairingCode) return; // код уже есть, дальше опрашивать незачем

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/subscriptions/${subscriptionId}`);
        if (!response.ok) return;
        const next = (await response.json()) as StatusResponse;
        setData(next);
      } catch {
        // тихо пропускаем один тик, попробуем на следующем
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [subscriptionId, data.status, data.pairingCode]);

  if (data.status === "pending_payment") {
    return (
      <div className="rounded-2xl border border-border bg-white/5 p-6 text-center">
        <p className="font-medium">Ожидаем подтверждения оплаты</p>
        <p className="mt-2 text-sm text-muted">Обычно это занимает не больше пары часов.</p>
      </div>
    );
  }

  if (data.status === "active" && data.pairingCode) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <p className="font-medium">Оплата подтверждена! Подключите WhatsApp</p>
        <p className="mt-3 text-3xl font-bold tracking-widest">{data.pairingCode}</p>
        <ol className="mt-4 space-y-1 text-left text-sm text-muted">
          <li>1. Откройте WhatsApp на телефоне бизнеса → Настройки → Связанные устройства</li>
          <li>2. «Привязать устройство» → «Привязать по номеру телефона»</li>
          <li>3. Введите код выше</li>
        </ol>
      </div>
    );
  }

  if (data.status === "active") {
    return (
      <div className="rounded-2xl border border-border bg-white/5 p-6 text-center">
        <p className="font-medium">Оплата подтверждена, готовим код привязки…</p>
      </div>
    );
  }

  if (data.status === "expired") {
    return (
      <div className="rounded-2xl border border-border bg-white/5 p-6 text-center">
        <p className="font-medium">Подписка истекла</p>
        <p className="mt-2 text-sm text-muted">Оплатите заново, чтобы бот снова заработал.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white/5 p-6 text-center">
      <p className="font-medium">Подписка отменена</p>
    </div>
  );
}
