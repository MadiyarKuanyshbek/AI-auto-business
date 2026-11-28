import { printHtml } from "./print";
import { desktopBridge } from "../transport/desktop";

/** Сохраняет отчёт в PDF (в настольном приложении сразу в «Документы\AutoFlash\Reports»), иначе открывает печать. */
export async function saveReportPdf(html: string, fallbackText: string, name: string): Promise<string | null> {
  const bridge = desktopBridge();
  if (!bridge) {
    await printHtml(html, fallbackText);
    return null;
  }
  const file = await bridge.files.savePdf(html, name);
  void bridge.files.reveal(file);
  return file;
}
