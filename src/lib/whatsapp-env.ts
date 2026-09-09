import "server-only";

// Central reader for the WhatsApp Cloud API environment.
//
// The hotel shares its WhatsApp number with the SAAS project, whose Vercel
// variables are named the same way except for the webhook verify token
// (SAAS: WHATSAPP_WEBHOOK_VERIFY_TOKEN, here: WHATSAPP_VERIFY_TOKEN). Both
// names are accepted so one set of Vercel *shared* variables can serve both
// apps without renaming anything.
//
// Values are never logged and never leave the server; the setup page only
// reports whether each one is present.

/** "YOUR_" anywhere marks a .env.example placeholder value. */
export function isPlaceholder(value: string | undefined | null): boolean {
  return !value || value.trim() === "" || value.includes("YOUR_");
}

function clean(value: string | undefined): string | null {
  return isPlaceholder(value) ? null : (value as string).trim();
}

/** wa_id form of a phone number: digits only (Meta's `from` field has no "+"). */
export function toSenderId(value: string): string {
  return value.replace(/\D/g, "");
}

/** "96877332220, +968 9947 5688" → ["96877332220", "96899475688"] (deduped, digits only). */
export function parseForwardSenders(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(/[,;\r\n]+/)) {
    const id = toSenderId(part);
    if (id.length >= 7 && !out.includes(id)) out.push(id);
  }
  return out;
}

export interface WhatsAppEnv {
  accessToken: string | null;
  phoneNumberId: string | null;
  /** WABA id — optional, discovered from the token when unset. */
  businessAccountId: string | null;
  /** Meta app id — optional, discovered from the token when unset. */
  appId: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  /** Webhook of the other app sharing this number (SAAS); events are relayed there. */
  forwardUrl: string | null;
  /** wa_ids whose inbound messages belong to the other app (its admins). */
  forwardSenders: string[];
}

export function whatsappEnv(): WhatsAppEnv {
  return {
    accessToken: clean(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: clean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    businessAccountId: clean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    appId: clean(process.env.WHATSAPP_APP_ID),
    appSecret: clean(process.env.WHATSAPP_APP_SECRET),
    verifyToken: clean(process.env.WHATSAPP_VERIFY_TOKEN) ?? clean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    forwardUrl: clean(process.env.WHATSAPP_FORWARD_URL)?.replace(/\/+$/, "") ?? null,
    forwardSenders: parseForwardSenders(process.env.WHATSAPP_FORWARD_SENDERS),
  };
}

/**
 * The WhatsApp Business Account id can also be saved from the setup page
 * (settings.messaging.whatsapp_business_account_id) — no redeploy needed.
 * The environment variable wins when both are present.
 */
export function withStoredBusinessAccountId(env: WhatsAppEnv, stored: string | null | undefined): WhatsAppEnv {
  if (env.businessAccountId) return env;
  const id = (stored ?? "").replace(/\D/g, "");
  return id.length >= 6 ? { ...env, businessAccountId: id } : env;
}

/** Public base URL of this deployment (no trailing slash). */
export function appBaseUrl(): string {
  const raw = clean(process.env.NEXT_PUBLIC_APP_URL) ?? "https://sama-crm.vercel.app";
  return raw.replace(/\/+$/, "");
}

/** The callback URL Meta must call for this deployment. */
export function webhookCallbackUrl(): string {
  return `${appBaseUrl()}/api/webhooks/whatsapp`;
}
