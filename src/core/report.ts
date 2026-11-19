import { analyzeScan, identifyFamily } from "./catalog";
import type { VehicleScan } from "./scanner";
import { resolveModelYear } from "./vin";

export function reportTitle(scan: VehicleScan): string {
  const make = scan.vinOnline?.make ?? scan.vinInfo?.make ?? "Автомобиль";
  const year = resolveModelYear(scan.vinInfo, scan.vinOnline);
  return [make, scan.vinOnline?.model, year ? `(${year})` : ""].filter(Boolean).join(" ");
}

const sw = (e: VehicleScan["ecus"][number]) => e.ident.supplierSoftwareNumber ?? e.ident.softwareNumber ?? e.ident.softwareVersion ?? "—";
const hw = (e: VehicleScan["ecus"][number]) => e.ident.hardwareNumber ?? e.ident.supplierHardwareNumber ?? "—";

/** Короткий текстовый отчёт для мессенджера. */
export function buildReportText(scan: VehicleScan): string {
  return [
    `Отчёт AutoFlash: ${reportTitle(scan)}`,
    `VIN: ${scan.vin ?? "—"}`,
    `Дата: ${new Date(scan.scannedAt).toLocaleString("ru-RU")}`,
    `Напряжение: ${scan.adapter.voltage ?? "—"} В`,
    "",
    "Блоки:",
    ...scan.ecus.map((e) => `• ${e.name} (${e.txId}): ПО ${sw(e)}, HW ${hw(e)}`),
    "",
    `Calibration ID: ${scan.mode09.calibrationIds.join(", ") || "—"}`,
    `Ошибки: ${scan.dtcs.map((d) => `${d.code}${d.description ? ` (${d.description})` : ""}`).join("; ") || "нет"}`,
  ].join("\n");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Страница отчёта для печати или сохранения в PDF (клиенту в руки). */
export function buildReportHtml(scan: VehicleScan, workshop = "AutoFlash"): string {
  const advisories = analyzeScan(scan);
  const rows = scan.ecus
    .map(
      (e) => `<tr><td>${esc(e.name)}</td><td>${esc(identifyFamily(e).name)}</td><td>${esc(sw(e))}</td><td>${esc(hw(e))}</td></tr>`,
    )
    .join("");
  const dtcs = scan.dtcs.length
    ? scan.dtcs.map((d) => `<li><b>${esc(d.code)}</b> ${esc(d.description ?? "")}</li>`).join("")
    : "<li>Кодов неисправностей нет</li>";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(reportTitle(scan))}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px}.muted{color:#666;font-size:12px}</style></head><body>
<p class="muted">${esc(workshop)} · ${esc(new Date(scan.scannedAt).toLocaleString("ru-RU"))}</p>
<h1>${esc(reportTitle(scan))}</h1>
<p>VIN: <b>${esc(scan.vin ?? "—")}</b> · напряжение: ${scan.adapter.voltage ?? "—"} В · Calibration ID: ${esc(scan.mode09.calibrationIds.join(", ") || "—")}</p>
<h2>Блоки управления</h2>
<table><tr><th>Блок</th><th>Семейство</th><th>Версия ПО</th><th>Номер HW</th></tr>${rows}</table>
<h2>Ошибки</h2><ul>${dtcs}</ul>
${advisories.length ? `<h2>Замечания</h2><ul>${advisories.map((a) => `<li>${esc(a.text)}</li>`).join("")}</ul>` : ""}
<p class="muted">Данные считаны по стандартным диагностическим запросам (OBD-II/UDS), без изменения содержимого блоков.</p>
</body></html>`;
}
