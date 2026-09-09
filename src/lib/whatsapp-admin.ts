import "server-only";

import { whatsappEnv, type WhatsAppEnv } from "./whatsapp-env";

// Meta Graph API *management* calls used by the back-office WhatsApp setup
// page: token inspection, phone number info, WABA discovery, webhook
// subscription (WABA-level callback override) and message templates.
// Sending lives in src/lib/whatsapp.ts — this file never sends to guests.
//
// Every function returns a GraphResult instead of throwing so the setup page
// can render partial state (e.g. token valid but template listing forbidden).

export const GRAPH_VERSION = "v20.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface GraphFailure {
  ok: false;
  error: string;
  code: number | null;
  subcode: number | null;
  status: number | null;
}
export type GraphResult<T> = { ok: true; data: T } | GraphFailure;

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string; error_user_title?: string };
}

async function graph<T>(
  path: string,
  init: { token: string; method?: "GET" | "POST"; query?: Record<string, string>; json?: unknown }
): Promise<GraphResult<T>> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${init.token}`,
        ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
    if (!res.ok || data?.error) {
      const e = data?.error;
      const message = e?.error_user_msg ?? e?.message ?? `Meta API error (HTTP ${res.status})`;
      return {
        ok: false,
        error: e?.code ? `(#${e.code}) ${message}` : message,
        code: e?.code ?? null,
        subcode: e?.error_subcode ?? null,
        status: res.status,
      };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e as Error).message, code: null, subcode: null, status: null };
  }
}

function needToken(env: WhatsAppEnv): GraphFailure | null {
  if (!env.accessToken) {
    return { ok: false, error: "WHATSAPP_ACCESS_TOKEN is not set", code: null, subcode: null, status: null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------
export interface TokenInfo {
  appId: string | null;
  type: string | null;
  /** Unix seconds; 0 = never expires (system-user tokens). */
  expiresAt: number | null;
  isValid: boolean;
  scopes: string[];
  /** WABA ids the token was granted (from granular scopes). */
  wabaIds: string[];
}

export async function debugToken(env: WhatsAppEnv = whatsappEnv()): Promise<GraphResult<TokenInfo>> {
  const missing = needToken(env);
  if (missing) return missing;
  const r = await graph<{
    data?: {
      app_id?: string;
      type?: string;
      expires_at?: number;
      is_valid?: boolean;
      scopes?: string[];
      granular_scopes?: { scope?: string; target_ids?: string[] }[];
    };
  }>("debug_token", { token: env.accessToken!, query: { input_token: env.accessToken! } });
  if (!r.ok) return r;
  const d = r.data.data ?? {};
  const wabaIds = new Set<string>();
  for (const g of d.granular_scopes ?? []) {
    if (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") {
      for (const id of g.target_ids ?? []) wabaIds.add(String(id));
    }
  }
  return {
    ok: true,
    data: {
      appId: d.app_id ? String(d.app_id) : null,
      type: d.type ?? null,
      expiresAt: typeof d.expires_at === "number" ? d.expires_at : null,
      isValid: Boolean(d.is_valid),
      scopes: d.scopes ?? [],
      wabaIds: Array.from(wabaIds),
    },
  };
}

// ---------------------------------------------------------------------------
// Phone number + WABA
// ---------------------------------------------------------------------------
export interface PhoneNumberInfo {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
}

export async function getPhoneNumber(env: WhatsAppEnv = whatsappEnv()): Promise<GraphResult<PhoneNumberInfo>> {
  const missing = needToken(env);
  if (missing) return missing;
  if (!env.phoneNumberId) {
    return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID is not set", code: null, subcode: null, status: null };
  }
  const r = await graph<{
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    code_verification_status?: string;
  }>(env.phoneNumberId, {
    token: env.accessToken!,
    query: { fields: "display_phone_number,verified_name,quality_rating,code_verification_status" },
  });
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      id: r.data.id ?? env.phoneNumberId,
      displayPhoneNumber: r.data.display_phone_number ?? null,
      verifiedName: r.data.verified_name ?? null,
      qualityRating: r.data.quality_rating ?? null,
      codeVerificationStatus: r.data.code_verification_status ?? null,
    },
  };
}

export interface WabaDiscovery {
  /** The WABA that owns the configured phone number, when it could be determined. */
  wabaId: string | null;
  /** Every WABA id seen on the way (for the setup page). */
  candidates: string[];
  /** One line per source tried — shown when discovery fails so the admin knows why. */
  notes: string[];
}

/**
 * Find the WhatsApp Business Account that owns our phone number. Sources, in
 * order: WHATSAPP_BUSINESS_ACCOUNT_ID (or the id saved on the setup page),
 * the token's granular scopes, the same lookup through the app access token,
 * and the business portfolios the token can list. Every candidate is checked
 * against the phone number id; a single unverifiable candidate is accepted.
 */
export async function discoverWabaId(env: WhatsAppEnv = whatsappEnv(), token?: TokenInfo | null): Promise<WabaDiscovery> {
  const notes: string[] = [];
  if (env.businessAccountId) {
    return { wabaId: env.businessAccountId, candidates: [env.businessAccountId], notes: ["configured id"] };
  }
  if (!env.accessToken) return { wabaId: null, candidates: [], notes: ["no access token"] };

  const candidates = new Set<string>();

  // a) granular scopes of the token itself
  if (token) {
    for (const id of token.wabaIds) candidates.add(id);
    notes.push(`token scopes: ${token.wabaIds.length} account(s)`);
  } else {
    notes.push("token could not be inspected");
  }

  // b) the same inspection through the app access token (the documented way)
  const appId = env.appId ?? token?.appId ?? null;
  if (appId && env.appSecret) {
    const r = await graph<{ data?: { granular_scopes?: { scope?: string; target_ids?: string[] }[] } }>("debug_token", {
      token: `${appId}|${env.appSecret}`,
      query: { input_token: env.accessToken },
    });
    if (r.ok) {
      let n = 0;
      for (const g of r.data.data?.granular_scopes ?? []) {
        if (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") {
          for (const id of g.target_ids ?? []) {
            candidates.add(String(id));
            n++;
          }
        }
      }
      notes.push(`app inspection: ${n} account(s)`);
    } else {
      notes.push(`app inspection failed: ${r.error}`);
    }
  } else {
    notes.push(appId ? "app inspection skipped: WHATSAPP_APP_SECRET missing" : "app inspection skipped: app id unknown");
  }

  // c) business portfolios the token can see → their owned / shared accounts
  const biz = await graph<{ data?: { id?: string }[] }>("me/businesses", { token: env.accessToken, query: { fields: "id", limit: "50" } });
  if (biz.ok) {
    let n = 0;
    for (const b of biz.data.data ?? []) {
      if (!b.id) continue;
      for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
        const r = await graph<{ data?: { id?: string }[] }>(`${b.id}/${edge}`, { token: env.accessToken, query: { fields: "id", limit: "100" } });
        if (!r.ok) continue;
        for (const w of r.data.data ?? []) {
          if (w.id) {
            candidates.add(String(w.id));
            n++;
          }
        }
      }
    }
    notes.push(`business portfolios: ${(biz.data.data ?? []).length}, ${n} account(s)`);
  } else {
    notes.push(`business portfolios: ${biz.error}`);
  }

  const list = Array.from(candidates);
  for (const waba of list) {
    const r = await graph<{ data?: { id?: string }[] }>(`${waba}/phone_numbers`, {
      token: env.accessToken,
      query: { fields: "id", limit: "100" },
    });
    if (r.ok && (r.data.data ?? []).some((p) => String(p.id) === env.phoneNumberId)) {
      return { wabaId: waba, candidates: list, notes: [...notes, `${waba} owns the phone number`] };
    }
  }
  if (list.length === 1) return { wabaId: list[0], candidates: list, notes: [...notes, "single candidate accepted"] };
  notes.push(list.length === 0 ? "no account found" : `${list.length} candidates, none lists the phone number`);
  return { wabaId: null, candidates: list, notes };
}

/** Convenience wrapper: just the id. */
export async function resolveWabaId(env: WhatsAppEnv = whatsappEnv(), token?: TokenInfo | null): Promise<string | null> {
  return (await discoverWabaId(env, token)).wabaId;
}

// ---------------------------------------------------------------------------
// Webhook subscription (WABA level — overrides the app-level callback for
// this WABA only, so the other app's dashboard configuration stays untouched)
// ---------------------------------------------------------------------------
export interface SubscribedApp {
  id: string | null;
  name: string | null;
  link: string | null;
  overrideCallbackUri: string | null;
}

export async function getWabaSubscribedApps(wabaId: string, env: WhatsAppEnv = whatsappEnv()): Promise<GraphResult<SubscribedApp[]>> {
  const missing = needToken(env);
  if (missing) return missing;
  const r = await graph<{
    data?: { whatsapp_business_api_data?: { id?: string; name?: string; link?: string }; override_callback_uri?: string }[];
  }>(`${wabaId}/subscribed_apps`, { token: env.accessToken! });
  if (!r.ok) return r;
  return {
    ok: true,
    data: (r.data.data ?? []).map((a) => ({
      id: a.whatsapp_business_api_data?.id ? String(a.whatsapp_business_api_data.id) : null,
      name: a.whatsapp_business_api_data?.name ?? null,
      link: a.whatsapp_business_api_data?.link ?? null,
      overrideCallbackUri: a.override_callback_uri ?? null,
    })),
  };
}

/** Subscribe (idempotent) and point this WABA's webhooks at `callbackUri`. Meta verifies the URL synchronously. */
export async function setWabaWebhookOverride(
  wabaId: string,
  callbackUri: string,
  verifyToken: string,
  env: WhatsAppEnv = whatsappEnv()
): Promise<GraphResult<{ success: boolean }>> {
  const missing = needToken(env);
  if (missing) return missing;
  const r = await graph<{ success?: boolean }>(`${wabaId}/subscribed_apps`, {
    token: env.accessToken!,
    method: "POST",
    json: { override_callback_uri: callbackUri, verify_token: verifyToken },
  });
  if (!r.ok) return r;
  return { ok: true, data: { success: Boolean(r.data.success) } };
}

/**
 * Effective webhook targets for the business phone number, from Meta's
 * `webhook_configuration` field: phone-level override → WABA-level override →
 * the app's callback. Meta uses the most specific one that is set.
 */
export interface PhoneWebhookConfig {
  phoneNumber: string | null;
  whatsappBusinessAccount: string | null;
  application: string | null;
}

export async function getPhoneWebhookConfig(env: WhatsAppEnv = whatsappEnv()): Promise<GraphResult<PhoneWebhookConfig>> {
  const missing = needToken(env);
  if (missing) return missing;
  if (!env.phoneNumberId) {
    return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID is not set", code: null, subcode: null, status: null };
  }
  const r = await graph<{
    webhook_configuration?: { phone_number?: string; whatsapp_business_account?: string; application?: string };
  }>(env.phoneNumberId, { token: env.accessToken!, query: { fields: "webhook_configuration" } });
  if (!r.ok) return r;
  const c = r.data.webhook_configuration ?? {};
  return {
    ok: true,
    data: {
      phoneNumber: c.phone_number ?? null,
      whatsappBusinessAccount: c.whatsapp_business_account ?? null,
      application: c.application ?? null,
    },
  };
}

/**
 * Point this phone number's webhooks at `callbackUri` (phone-level override —
 * needs only the phone number id, not the account id). Meta verifies the URL
 * synchronously with the verify token. An empty `callbackUri` removes the override.
 */
export async function setPhoneWebhookOverride(
  callbackUri: string,
  verifyToken: string,
  env: WhatsAppEnv = whatsappEnv()
): Promise<GraphResult<{ success: boolean }>> {
  const missing = needToken(env);
  if (missing) return missing;
  if (!env.phoneNumberId) {
    return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID is not set", code: null, subcode: null, status: null };
  }
  const r = await graph<{ success?: boolean }>(env.phoneNumberId, {
    token: env.accessToken!,
    method: "POST",
    json: {
      webhook_configuration: callbackUri ? { override_callback_uri: callbackUri, verify_token: verifyToken } : { override_callback_uri: "" },
    },
  });
  if (!r.ok) return r;
  return { ok: true, data: { success: Boolean(r.data.success) } };
}

export interface AppSubscription {
  object: string | null;
  callbackUrl: string | null;
  active: boolean;
  fields: string[];
}

/** App-level webhook configuration (what the Meta dashboard shows). Needs the app secret. */
export async function getAppSubscriptions(appId: string, env: WhatsAppEnv = whatsappEnv()): Promise<GraphResult<AppSubscription[]>> {
  if (!env.appSecret) {
    return { ok: false, error: "WHATSAPP_APP_SECRET is not set", code: null, subcode: null, status: null };
  }
  const r = await graph<{
    data?: { object?: string; callback_url?: string; active?: boolean; fields?: { name?: string }[] }[];
  }>(`${appId}/subscriptions`, { token: `${appId}|${env.appSecret}` });
  if (!r.ok) return r;
  return {
    ok: true,
    data: (r.data.data ?? []).map((s) => ({
      object: s.object ?? null,
      callbackUrl: s.callback_url ?? null,
      active: Boolean(s.active),
      fields: (s.fields ?? []).map((f) => f.name ?? "").filter(Boolean),
    })),
  };
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------
export interface TemplateStatus {
  id: string | null;
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
}

export async function listTemplates(
  wabaId: string,
  names: readonly string[],
  env: WhatsAppEnv = whatsappEnv()
): Promise<GraphResult<TemplateStatus[]>> {
  const missing = needToken(env);
  if (missing) return missing;
  const wanted = new Set(names);
  const out: TemplateStatus[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await graph<{
      data?: { id?: string; name?: string; language?: string; status?: string; category?: string; rejected_reason?: string }[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${wabaId}/message_templates`, {
      token: env.accessToken!,
      query: { fields: "id,name,language,status,category,rejected_reason", limit: "100", ...(after ? { after } : {}) },
    });
    if (!r.ok) return r;
    for (const t of r.data.data ?? []) {
      if (!t.name || !wanted.has(t.name)) continue;
      out.push({
        id: t.id ?? null,
        name: t.name,
        language: t.language ?? "",
        status: t.status ?? "UNKNOWN",
        category: t.category ?? null,
        rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
      });
    }
    if (!r.data.paging?.next || !r.data.paging.cursors?.after) break;
    after = r.data.paging.cursors.after;
  }
  return { ok: true, data: out };
}

export interface TemplateCreateInput {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  body: string;
  /** One sample value per {{n}} — Meta requires examples for every variable. */
  examples: string[];
}

export async function createTemplate(
  wabaId: string,
  input: TemplateCreateInput,
  env: WhatsAppEnv = whatsappEnv()
): Promise<GraphResult<{ id: string | null; status: string | null; category: string | null }>> {
  const missing = needToken(env);
  if (missing) return missing;
  const r = await graph<{ id?: string; status?: string; category?: string }>(`${wabaId}/message_templates`, {
    token: env.accessToken!,
    method: "POST",
    json: {
      name: input.name,
      language: input.language,
      category: input.category,
      components: [
        {
          type: "BODY",
          text: input.body,
          ...(input.examples.length > 0 ? { example: { body_text: [input.examples] } } : {}),
        },
      ],
    },
  });
  if (!r.ok) return r;
  return { ok: true, data: { id: r.data.id ?? null, status: r.data.status ?? null, category: r.data.category ?? null } };
}
