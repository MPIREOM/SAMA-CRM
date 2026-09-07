// Pure error classification for the providers (no I/O — unit-tested).
//
// Meta Cloud API errors surface as `(#<code>) <message>` in error.message,
// so the numeric code can be recovered from the message text alone; HTTP
// status fallbacks come from src/lib/whatsapp.ts ("WhatsApp API error (HTTP 500)").

export interface Classification {
  retryable: boolean;
  /** Human-readable reason stored in bk_scheduled_messages.last_error / bk_message_log.error. */
  reason: string;
  /** Meta error code when it could be determined. */
  code: number | null;
}

/** Template missing / not approved / paused / parameter mismatch → fix in Meta, never retry. */
export const META_TEMPLATE_ERRORS = new Set([132000, 132001, 132005, 132007, 132012, 132015, 132016]);
/** Recipient-side, permanent for this message: re-engagement window, undeliverable, invalid recipient. */
export const META_RECIPIENT_ERRORS = new Set([131047, 131026, 131021, 131030, 131051, 131052, 131053]);
/** Throttling — try again later. */
export const META_RATE_LIMIT_ERRORS = new Set([130429, 80007, 4, 131048, 131056, 133016]);
/** Meta-side transient failures. */
export const META_TRANSIENT_ERRORS = new Set([1, 2, 368, 131000, 131016, 131046]);

export function parseMetaCode(message: string): number | null {
  const m = /\(#(\d+)\)/.exec(message);
  if (m) return Number(m[1]);
  const c = /\bcode[:= ]+(\d{1,6})\b/i.exec(message);
  return c ? Number(c[1]) : null;
}

export function parseHttpStatus(message: string): number | null {
  const m = /HTTP\s+(\d{3})/i.exec(message);
  return m ? Number(m[1]) : null;
}

const NETWORK_RE = /fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|timeout|timed out|aborted/i;

export function isNetworkError(message: string): boolean {
  return NETWORK_RE.test(message);
}

export function classifyWhatsAppError(message: string, templateName: string, langCode: string): Classification {
  const msg = message || "Unknown WhatsApp error";
  const code = parseMetaCode(msg);

  if (code !== null) {
    if (META_TEMPLATE_ERRORS.has(code)) {
      return {
        retryable: false,
        code,
        reason: `Template ${templateName} (${langCode}) is not approved in Meta: ${msg}`,
      };
    }
    if (META_RECIPIENT_ERRORS.has(code)) {
      return { retryable: false, code, reason: `Recipient cannot receive this message: ${msg}` };
    }
    if (META_RATE_LIMIT_ERRORS.has(code)) {
      return { retryable: true, code, reason: `Rate limited by Meta: ${msg}` };
    }
    if (META_TRANSIENT_ERRORS.has(code)) {
      return { retryable: true, code, reason: `Temporary Meta error: ${msg}` };
    }
    // Auth / permission / unknown Meta codes: retrying won't help until someone fixes config.
    return { retryable: false, code, reason: msg };
  }

  // No numeric code — fall back to text and HTTP status.
  if (/template/i.test(msg) && /(not\s+(approved|exist|found)|does not exist|paused|disabled|mismatch)/i.test(msg)) {
    return { retryable: false, code: null, reason: `Template ${templateName} (${langCode}) is not approved in Meta: ${msg}` };
  }
  if (/re-?engagement|undeliverable|invalid recipient|not a valid whatsapp/i.test(msg)) {
    return { retryable: false, code: null, reason: msg };
  }
  if (/rate limit|too many|throttl/i.test(msg)) {
    return { retryable: true, code: null, reason: `Rate limited by Meta: ${msg}` };
  }
  const status = parseHttpStatus(msg);
  if (status !== null) {
    if (status === 429 || status >= 500) return { retryable: true, code: null, reason: msg };
    return { retryable: false, code: null, reason: msg };
  }
  if (isNetworkError(msg)) return { retryable: true, code: null, reason: `Network error: ${msg}` };
  return { retryable: false, code: null, reason: msg };
}

/** Resend: "The <domain> domain is not verified", "You can only send testing emails to your own email address …", EMAIL_FROM missing. */
export function isSenderNotVerified(message: string): boolean {
  return /not\s+verified|verify\s+(a|your|the)?\s*domain|domain\s+is\s+not|EMAIL_FROM is not configured|invalid_from|from.*(address|domain).*(invalid|not allowed)|only send testing emails/i.test(
    message
  );
}

export function classifyEmailError(message: string): Classification {
  const msg = message || "Unknown email error";
  const status = parseHttpStatus(msg);
  if (/rate[_ ]limit|too many requests|429/i.test(msg) || status === 429) {
    return { retryable: true, code: status ?? 429, reason: `Rate limited by Resend: ${msg}` };
  }
  if (/internal[_ ]server[_ ]error|application_error|service unavailable|5\d\d/i.test(msg) || (status !== null && status >= 500)) {
    return { retryable: true, code: status, reason: `Temporary Resend error: ${msg}` };
  }
  if (isNetworkError(msg)) return { retryable: true, code: null, reason: `Network error: ${msg}` };
  return { retryable: false, code: status, reason: msg };
}
