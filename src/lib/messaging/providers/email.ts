import "server-only";

import { Resend } from "resend";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { classifyEmailError, isSenderNotVerified } from "./errors";

// Email provider for guest messaging: wraps the CRM's sendEmail (Resend).
// When the configured EMAIL_FROM domain is not verified yet (typical before
// DNS is set up), it retries ONCE from Resend's shared onboarding sender so
// the guest still gets the message — and flags it, so the queue shows it.

export const FALLBACK_SENDER = "Sama Hotel <onboarding@resend.dev>";

export interface EmailSendResult {
  ok: boolean;
  stubbed: boolean;
  messageId: string | null;
  error: string | null;
  reason: string | null;
  retryable: boolean;
  /** True when the message went out from FALLBACK_SENDER instead of EMAIL_FROM. */
  fallback_sender: boolean;
}

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.includes("YOUR_");
}

export function emailConfigured(): boolean {
  return !isPlaceholder(process.env.RESEND_API_KEY);
}

const STUB: EmailSendResult = {
  ok: false,
  stubbed: true,
  messageId: null,
  error: "Resend is not configured (RESEND_API_KEY).",
  reason: "stubbed: RESEND_API_KEY not configured",
  retryable: false,
  fallback_sender: false,
};

async function sendViaFallbackSender(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<{ ok: boolean; messageId: string | null; error: string | null }> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({ from: FALLBACK_SENDER, to, subject, html, text });
    if (error) return { ok: false, messageId: null, error: error.message };
    return { ok: true, messageId: data?.id ?? null, error: null };
  } catch (e) {
    return { ok: false, messageId: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendGuestEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<EmailSendResult> {
  if (!emailConfigured()) return STUB;

  const first = await sendEmail(to, subject, html);
  if (first.ok) {
    return { ok: true, stubbed: false, messageId: first.messageId, error: null, reason: null, retryable: false, fallback_sender: false };
  }
  const firstError = first.error ?? "Unknown email error";
  if (/RESEND_API_KEY/.test(firstError)) return { ...STUB, error: firstError };

  if (isSenderNotVerified(firstError)) {
    logger.warn("messaging.email", "sender not verified — retrying from fallback sender", { to, error: firstError });
    const second = await sendViaFallbackSender(to, subject, html, text);
    if (second.ok) {
      return {
        ok: true,
        stubbed: false,
        messageId: second.messageId,
        error: null,
        reason: `sent from fallback sender (${firstError})`,
        retryable: false,
        fallback_sender: true,
      };
    }
    const secondError = second.error ?? "Unknown email error";
    const c = classifyEmailError(secondError);
    return {
      ok: false,
      stubbed: false,
      messageId: null,
      error: `${firstError}; fallback: ${secondError}`,
      reason: c.reason,
      retryable: c.retryable,
      fallback_sender: true,
    };
  }

  const c = classifyEmailError(firstError);
  logger.warn("messaging.email", "send failed", { to, retryable: c.retryable, error: firstError });
  return { ok: false, stubbed: false, messageId: null, error: firstError, reason: c.reason, retryable: c.retryable, fallback_sender: false };
}
