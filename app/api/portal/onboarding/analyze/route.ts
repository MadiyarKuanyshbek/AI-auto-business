import { NextResponse } from "next/server";
import { getPortalSubscription } from "@/lib/portalSession";
import { EXTRACTION_PROMPT, sanitizeExtraction } from "@/lib/onboarding";
import { generateJsonFromFiles, type InlineFile } from "@/src/gemini";

export const maxDuration = 60;

const MAX_FILE_BYTES = 3_500_000; // лимит тела запроса на Vercel — 4.5 МБ
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);

// Шаг 1 мастера настройки: владелец вставляет текст и/или грузит файлы
// (прайс, меню, фото) — Gemini достаёт структуру, клиент проверяет и правит.
export async function POST(request: Request) {
  const sub = await getPortalSubscription();
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const text = String(form.get("text") ?? "").trim().slice(0, 20000);
  const files: InlineFile[] = [];
  let extraText = "";

  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (entry.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }
    const type = entry.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
    }
    if (type === "text/plain") {
      extraText += `\n${(await entry.text()).slice(0, 20000)}`;
    } else {
      files.push({ mimeType: type, dataBase64: Buffer.from(await entry.arrayBuffer()).toString("base64") });
    }
  }
  if (files.length > 4) return NextResponse.json({ error: "too_many_files" }, { status: 400 });

  const source = `${text}${extraText}`.trim();
  if (!source && files.length === 0) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  const raw = await generateJsonFromFiles<unknown>(
    EXTRACTION_PROMPT,
    `Название бизнеса: ${sub.business_name}\n\nМатериал от владельца:\n${source || "(только вложенные файлы)"}`,
    files,
  );
  const data = sanitizeExtraction(raw);
  if (!data) return NextResponse.json({ error: "extraction_failed" }, { status: 422 });

  return NextResponse.json({ data });
}
