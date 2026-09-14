import { NextResponse } from "next/server";
import { escapeHtml, notifyOwner } from "@/lib/telegram";
import { waLinkFor } from "@/lib/phone";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>;
};

function buildAutoReply(firstName?: string) {
  const greeting = firstName ? `Здравствуйте, ${firstName}!` : "Здравствуйте!";
  return `${greeting} Это Автопилот.AI — мы настраиваем ИИ-администраторов для бизнеса: приём клиентов, запись, поддержка 24/7. Уже передал ваше сообщение менеджеру, он ответит вам здесь в ближайшее время 🙌`;
}

async function sendWhatsAppMessage(to: string, text: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) return;

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp send error ${response.status}: ${errorText}`);
  }
}

// Meta calls this once when you register the webhook, to confirm you own it.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  let payload: WhatsAppWebhookPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];

  // Delivery/read status callbacks and other event types land here too — ignore them.
  if (!message || message.type !== "text") {
    return NextResponse.json({ ok: true });
  }

  const from = message.from;
  const text = message.text?.body?.trim() ?? "";
  const contactName = value?.contacts?.[0]?.profile?.name || from;
  const firstName = value?.contacts?.[0]?.profile?.name?.split(" ")[0];

  const waLink = waLinkFor(from);
  const forwarded = [
    "💬 <b>Новое сообщение в WhatsApp</b>",
    `От: ${escapeHtml(contactName)} (${escapeHtml(from)})`,
    `Сообщение: ${escapeHtml(text)}`,
    "",
    `<a href="${waLink}">Открыть чат в WhatsApp →</a>`,
  ].join("\n");

  try {
    await Promise.all([
      sendWhatsAppMessage(from, buildAutoReply(firstName)),
      notifyOwner(forwarded, { html: true }),
    ]);
  } catch (error) {
    console.error("Failed to process WhatsApp message", error);
  }

  return NextResponse.json({ ok: true });
}
