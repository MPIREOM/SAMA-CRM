import "server-only";

import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { classifyWhatsAppError } from "./errors";

// WhatsApp provider for guest messaging: wraps the CRM's sendWhatsAppTemplate
// (Meta Cloud API) and classifies failures so the dispatcher knows whether a
// retry can help. Meta puts the numeric error code in the message text
// ("(#132001) Template name does not exist …"), which sendWhatsAppTemplate
// surfaces verbatim — no second call to the Graph API is needed.

export interface WhatsAppSendResult {
  ok: boolean;
  /** Credentials missing — nothing was sent, but the pipeline continues. */
  stubbed: boolean;
  messageId: string | null;
  /** Raw provider error text. */
  error: string | null;
  /** Classified, human-readable reason (what staff see in the queue). */
  reason: string | null;
  retryable: boolean;
  /** Meta error code when known. */
  code: number | null;
}

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.includes("YOUR_");
}

export function whatsappConfigured(): boolean {
  return !isPlaceholder(process.env.WHATSAPP_ACCESS_TOKEN) && !isPlaceholder(process.env.WHATSAPP_PHONE_NUMBER_ID);
}

const STUB: WhatsAppSendResult = {
  ok: false,
  stubbed: true,
  messageId: null,
  error: "WhatsApp Cloud API is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).",
  reason: "stubbed: WhatsApp credentials not configured",
  retryable: false,
  code: null,
};

export async function sendWhatsApp(
  phone: string,
  templateName: string,
  langCode: string,
  params: string[]
): Promise<WhatsAppSendResult> {
  if (!whatsappConfigured()) return STUB;

  let res: Awaited<ReturnType<typeof sendWhatsAppTemplate>>;
  try {
    res = await sendWhatsAppTemplate(phone, templateName, langCode, params);
  } catch (e) {
    // sendWhatsAppTemplate catches internally; this is belt-and-braces.
    const message = e instanceof Error ? e.message : String(e);
    const c = classifyWhatsAppError(message, templateName, langCode);
    return { ok: false, stubbed: false, messageId: null, error: message, ...c };
  }

  if (res.ok) {
    return { ok: true, stubbed: false, messageId: res.messageId, error: null, reason: null, retryable: false, code: null };
  }

  const message = res.error ?? "Unknown WhatsApp error";
  if (/not configured/i.test(message)) return { ...STUB, error: message };

  const c = classifyWhatsAppError(message, templateName, langCode);
  logger.warn("messaging.whatsapp", "send failed", {
    template: templateName,
    lang: langCode,
    code: c.code,
    retryable: c.retryable,
    error: message,
  });
  return { ok: false, stubbed: false, messageId: null, error: message, ...c };
}
