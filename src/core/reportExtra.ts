import { describeDtc } from "./dtc";
import { reportTitle, signatureBlockHtml } from "./report";
import type { VehicleScan } from "./scanner";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ───────────── Отчёт «до и после» ─────────────

export type ScanDiff = {
  ecuChanges: { ecu: string; field: string; before: string; after: string }[];
  fixedDtcs: string[];
  newDtcs: string[];
  unchangedDtcs: string[];
  voltage: { before: number | null; after: number | null };
};

const IDENT_FIELDS = ["softwareNumber", "softwareVersion", "supplierSoftwareNumber", "supplierSoftwareVersion", "hardwareNumber", "sparePartNumber"] as const;
const FIELD_LABEL: Record<string, string> = {
  softwareNumber: "Номер ПО",
  softwareVersion: "Версия ПО",
  supplierSoftwareNumber: "Номер ПО поставщика",
  supplierSoftwareVersion: "Версия ПО поставщика",
  hardwareNumber: "Номер HW",
  sparePartNumber: "Номер запчасти",
};

/** Что изменилось между двумя сканированиями одного автомобиля. */
export function diffScans(before: VehicleScan, after: VehicleScan): ScanDiff {
  const ecuChanges: ScanDiff["ecuChanges"] = [];
  for (const a of after.ecus) {
    const b = before.ecus.find((e) => e.txId === a.txId);
    if (!b) continue;
    for (const f of IDENT_FIELDS) {
      const bv = b.ident[f];
      const av = a.ident[f];
      if (bv !== av && (bv || av)) ecuChanges.push({ ecu: a.name, field: FIELD_LABEL[f], before: bv ?? "—", after: av ?? "—" });
    }
  }
  const bc = new Set(before.dtcs.map((d) => d.code));
  const ac = new Set(after.dtcs.map((d) => d.code));
  return {
    ecuChanges,
    fixedDtcs: [...bc].filter((c) => !ac.has(c)),
    newDtcs: [...ac].filter((c) => !bc.has(c)),
    unchangedDtcs: [...ac].filter((c) => bc.has(c)),
    voltage: { before: before.adapter.voltage, after: after.adapter.voltage },
  };
}

const PAGE_CSS =
  "body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px}h2{font-size:16px;margin-top:22px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px}.muted{color:#666;font-size:12px}.ok{color:#0a7d2c}.bad{color:#b42318}.sig{margin-top:40px;display:flex;gap:40px}.sig div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:12px}";

const when = (t: number) => new Date(t).toLocaleString("ru-RU");

export function buildComparisonHtml(before: VehicleScan, after: VehicleScan, opts: { workshop?: string; work?: string } = {}): string {
  const diff = diffScans(before, after);
  const rows = diff.ecuChanges.length
    ? diff.ecuChanges.map((c) => `<tr><td>${esc(c.ecu)}</td><td>${esc(c.field)}</td><td>${esc(c.before)}</td><td>${esc(c.after)}</td></tr>`).join("")
    : `<tr><td colspan="4">Версии ПО блоков не изменились</td></tr>`;
  const list = (codes: string[], cls: string) =>
    codes.length ? codes.map((c) => `<li class="${cls}"><b>${esc(c)}</b> ${esc(describeDtc(c) ?? "")}</li>`).join("") : "<li>—</li>";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(reportTitle(after))}: до и после</title><style>${PAGE_CSS}</style></head><body>
<p class="muted">${esc(opts.workshop || "AutoFlash")} · ${esc(when(after.scannedAt))}</p>
<h1>${esc(reportTitle(after))}: отчёт «до и после»</h1>
<p>VIN: <b>${esc(after.vin ?? "—")}</b>${opts.work ? ` · работы: ${esc(opts.work)}` : ""}</p>
<p class="muted">До: ${esc(when(before.scannedAt))} · После: ${esc(when(after.scannedAt))}</p>
<h2>Версии ПО блоков</h2>
<table><tr><th>Блок</th><th>Параметр</th><th>До</th><th>После</th></tr>${rows}</table>
<h2>Ошибки</h2>
<p>Устранено:</p><ul>${list(diff.fixedDtcs, "ok")}</ul>
<p>Появилось:</p><ul>${list(diff.newDtcs, "bad")}</ul>
<p>Осталось:</p><ul>${list(diff.unchangedDtcs, "")}</ul>
<p>Напряжение бортсети: ${diff.voltage.before ?? "—"} В → ${diff.voltage.after ?? "—"} В</p>
<p class="muted">Сравнение построено по результатам диагностического чтения (OBD-II/UDS).</p>
${signatureBlockHtml(opts.workshop || "AutoFlash")}
</body></html>`;
}

export function buildComparisonText(before: VehicleScan, after: VehicleScan): string {
  const d = diffScans(before, after);
  return [
    `${reportTitle(after)}: «до и после»`,
    `VIN: ${after.vin ?? "—"}`,
    `До: ${when(before.scannedAt)} · После: ${when(after.scannedAt)}`,
    "",
    d.ecuChanges.length ? d.ecuChanges.map((c) => `• ${c.ecu}, ${c.field}: ${c.before} → ${c.after}`).join("\n") : "Версии ПО блоков не изменились",
    `Ошибки устранены: ${d.fixedDtcs.join(", ") || "—"}`,
    `Новые ошибки: ${d.newDtcs.join(", ") || "—"}`,
    `Остались: ${d.unchangedDtcs.join(", ") || "—"}`,
  ].join("\n");
}

// ───────────── Квитанция по заказу ─────────────

export type ReceiptInput = {
  workshop: string;
  workshopPhone: string;
  jobTitle: string;
  jobNumber: string;
  date: number;
  customerName: string;
  customerPhone: string;
  vehicle: string;
  vin: string;
  priceKzt: number;
  paidKzt: number;
  notes: string;
};

const kzt = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₸`;

export function buildReceiptHtml(r: ReceiptInput): string {
  const left = Math.max(0, r.priceKzt - r.paidKzt);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Квитанция ${esc(r.jobNumber)}</title><style>${PAGE_CSS}</style></head><body>
<p class="muted">${esc(r.workshop || "AutoFlash")}${r.workshopPhone ? ` · ${esc(r.workshopPhone)}` : ""}</p>
<h1>Квитанция № ${esc(r.jobNumber)}</h1>
<p class="muted">${esc(when(r.date))}</p>
<table>
<tr><td>Клиент</td><td>${esc(r.customerName || "—")} ${esc(r.customerPhone)}</td></tr>
<tr><td>Автомобиль</td><td>${esc(r.vehicle || "—")} ${r.vin ? `· VIN ${esc(r.vin)}` : ""}</td></tr>
<tr><td>Работы</td><td>${esc(r.jobTitle)}</td></tr>
<tr><td>Стоимость</td><td>${kzt(r.priceKzt)}</td></tr>
<tr><td>Оплачено</td><td>${kzt(r.paidKzt)}</td></tr>
<tr><td><b>К оплате</b></td><td><b class="${left ? "bad" : "ok"}">${kzt(left)}</b></td></tr>
</table>
${r.notes ? `<p><b>Примечания:</b> ${esc(r.notes)}</p>` : ""}
<p class="muted">Изменение калибровок может повлиять на выбросы, ресурс агрегатов и гарантию производителя. Клиент уведомлён и согласен.</p>
<div class="sig"><div>Исполнитель</div><div>Клиент</div></div>
</body></html>`;
}

export function buildReceiptText(r: ReceiptInput): string {
  return [
    `${r.workshop || "AutoFlash"}${r.workshopPhone ? ` · ${r.workshopPhone}` : ""}`,
    `Квитанция № ${r.jobNumber} от ${when(r.date)}`,
    `Клиент: ${r.customerName || "—"} ${r.customerPhone}`,
    `Автомобиль: ${r.vehicle || "—"} ${r.vin ? `VIN ${r.vin}` : ""}`,
    `Работы: ${r.jobTitle}`,
    `Стоимость: ${kzt(r.priceKzt)}, оплачено: ${kzt(r.paidKzt)}, к оплате: ${kzt(Math.max(0, r.priceKzt - r.paidKzt))}`,
  ].join("\n");
}
