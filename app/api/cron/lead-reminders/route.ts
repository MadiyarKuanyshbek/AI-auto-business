import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { sql, type LeadRow } from "@/lib/db";
import { escapeHtml, notifyOwner } from "@/lib/telegram";

// Раз в день (см. vercel.json) проверяет заявки со статусом "new" старше
// суток, на которые ещё не напоминали за последние сутки — и шлёт владельцу
// один дайджест в Telegram. Никому из клиентов ничего не отправляет — это
// напоминание только вам, про заявки, которые уже сами к вам обратились.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!sql) {
    return NextResponse.json({ skipped: true, reason: "no_database" });
  }

  const stale = (await sql`
    SELECT * FROM leads
    WHERE status = 'new'
      AND created_at < now() - interval '24 hours'
      AND (reminded_at IS NULL OR reminded_at < now() - interval '24 hours')
    ORDER BY created_at ASC
    LIMIT 20
  `) as LeadRow[];

  if (stale.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0 });
  }

  const lines = [
    `⏰ <b>Заявки без ответа больше суток (${stale.length})</b>`,
    "",
    ...stale.map(
      (lead) =>
        `• ${escapeHtml(lead.name)} (${escapeHtml(lead.contact)}) — ${escapeHtml(lead.niche || "без ниши")}, ` +
        `${new Date(lead.created_at).toLocaleDateString("ru-RU")}`,
    ),
    "",
    "Проверить и отметить статус можно в /admin.",
  ];

  await notifyOwner(lines.join("\n"), { html: true });

  const ids = stale.map((lead) => lead.id);
  await sql`UPDATE leads SET reminded_at = now() WHERE id = ANY(${ids})`;

  return NextResponse.json({ ok: true, reminded: stale.length });
}
