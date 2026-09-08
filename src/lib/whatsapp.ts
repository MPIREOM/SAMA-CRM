import "server-only";

import { toWaId } from "@/lib/phone";

// WhatsApp Cloud API send helpers. SERVER ONLY.
// Requires WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID (see .env.example).

const GRAPH_VERSION = "v20.0";

interface WaSendResult {
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

function waConfigured(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return Boolean(token && phoneId && !token.startsWith("YOUR_") && !phoneId.startsWith("YOUR_"));
}

async function waPost(payload: Record<string, unknown>): Promise<WaSendResult> {
  if (!waConfigured()) {
    return {
      ok: false,
      messageId: null,
      error:
        "WhatsApp Cloud API is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).",
    };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      messages?: { id?: string }[];
    };
    if (!res.ok) {
      return {
        ok: false,
        messageId: null,
        error: data?.error?.message ?? `WhatsApp API error (HTTP ${res.status})`,
      };
    }
    return { ok: true, messageId: data?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    return { ok: false, messageId: null, error: (e as Error).message };
  }
}

/**
 * Free-form text message — ONLY valid inside the 24h customer-service window
 * (i.e. within 24h of the guest's last inbound message). Callers must check.
 */
export async function sendWhatsAppText(
  phone: string,
  body: string
): Promise<WaSendResult> {
  return waPost({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWaId(phone),
    type: "text",
    text: { preview_url: true, body },
  });
}

/**
 * Pre-approved template message — required OUTSIDE the 24h window.
 * `templateName` must exist and be APPROVED in WhatsApp Manager.
 * `bodyParams` fill the template's {{1}}, {{2}}, … placeholders in order.
 * Meta rejects text parameters containing newlines/tabs or 4+ consecutive
 * spaces, so params are collapsed to single-spaced text before sending.
 */
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  langCode: string, // e.g. "ar" | "en" | "en_US"
  bodyParams: string[] = []
): Promise<WaSendResult> {
  bodyParams = bodyParams.map((p) => p.replace(/\s+/g, " ").trim());
  return waPost({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWaId(phone),
    type: "template",
    template: {
      name: templateName,
      language: { code: langCode },
      ...(bodyParams.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParams.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    },
  });
}
