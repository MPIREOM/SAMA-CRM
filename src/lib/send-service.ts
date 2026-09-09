import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText, sendWhatsAppTemplate, sendWhatsAppTemplateComponents } from "@/lib/whatsapp";
import type { WaTemplateComponent } from "@/lib/messaging/meta-template-model";
import { sendEmail, bilingualEmailHtml, splitBilingual } from "@/lib/email";
import { canReceiveWhatsAppMarketing } from "@/lib/phone";
import { isWithin24h } from "@/lib/utils";
import type { Contact } from "@/lib/database.types";

// Single choke-point for ALL outbound sends (automations, campaigns, booking
// confirmations). Enforces compliance rules and logs every attempt to
// `messages` so dedup checks and the inbox history stay accurate.

export interface SendParams {
  contact: Pick<
    Contact,
    "id" | "phone" | "email" | "name" | "market" | "consent" | "last_inbound_at"
  >;
  channel: "whatsapp" | "email";
  msgType: "utility" | "marketing";
  body: string; // fully rendered bilingual text (Arabic ⸻ English)
  subject?: string; // email only
  automationId?: string | null;
  campaignId?: string | null;
  bookingId?: string | null;
  /**
   * An approved Meta template with its per-guest components (campaigns).
   * Sent regardless of the 24h window; `body` should be the rendered text.
   */
  template?: { name: string; language: string; components: WaTemplateComponent[] } | null;
}

export interface SendOutcome {
  sent: boolean;
  skipped: boolean;
  reason: string | null;
}

export async function sendToContact(params: SendParams): Promise<SendOutcome> {
  const { contact, channel, msgType, body, subject } = params;
  const admin = createAdminClient();

  // --- Compliance gates -----------------------------------------------------
  if (msgType === "marketing") {
    if (!contact.consent) {
      return { sent: false, skipped: true, reason: "no_consent" };
    }
    // HARD RULE: WhatsApp marketing never goes to International numbers.
    if (channel === "whatsapp" && !canReceiveWhatsAppMarketing(contact.market)) {
      return { sent: false, skipped: true, reason: "market_not_allowed" };
    }
  }

  let ok = false;
  let providerMsgId: string | null = null;
  let error: string | null = null;

  if (channel === "whatsapp") {
    if (!contact.phone) return { sent: false, skipped: true, reason: "no_phone" };
    if (params.template) {
      // Approved template → allowed at any time, no free-text fallback.
      const res = await sendWhatsAppTemplateComponents(contact.phone, params.template.name, params.template.language, params.template.components);
      ok = res.ok;
      providerMsgId = res.messageId;
      error = res.error;
    } else if (isWithin24h(contact.last_inbound_at)) {
      // Inside the 24h customer-service window → free-form text is allowed.
      const res = await sendWhatsAppText(contact.phone, body);
      ok = res.ok;
      providerMsgId = res.messageId;
      error = res.error;
    } else {
      // Outside the window → Meta requires a pre-approved template. We use a
      // generic approved template with one body parameter carrying the text.
      const templateName = process.env.WHATSAPP_REENGAGE_TEMPLATE;
      if (!templateName || templateName.startsWith("YOUR_")) {
        error =
          "Outside 24h window and WHATSAPP_REENGAGE_TEMPLATE is not configured.";
      } else {
        const res = await sendWhatsAppTemplate(
          contact.phone,
          templateName,
          "ar",
          [body]
        );
        ok = res.ok;
        providerMsgId = res.messageId;
        error = res.error;
      }
    }
  } else {
    if (!contact.email) return { sent: false, skipped: true, reason: "no_email" };
    const { ar, en } = splitBilingual(body);
    const res = await sendEmail(
      contact.email,
      subject || "Sama Hotel | فندق سما",
      bilingualEmailHtml(ar, en)
    );
    ok = res.ok;
    providerMsgId = res.messageId;
    error = res.error;
  }

  // --- Log every attempt ----------------------------------------------------
  await admin.from("messages").insert({
    contact_id: contact.id,
    direction: "outbound",
    channel,
    status: ok ? "sent" : "failed",
    body: ok ? body : `${body}\n\n[error: ${error}]`,
    provider_msg_id: providerMsgId,
    automation_id: params.automationId ?? null,
    campaign_id: params.campaignId ?? null,
    booking_id: params.bookingId ?? null,
  });

  return { sent: ok, skipped: false, reason: error };
}
