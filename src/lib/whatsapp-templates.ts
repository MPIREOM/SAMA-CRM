import "server-only";

import { getSettings } from "@/lib/bk/settings";
import type { MetaTemplateSummary } from "@/lib/messaging/meta-template-model";
import { whatsappEnv, withStoredAppId, withStoredBusinessAccountId, type WhatsAppEnv } from "./whatsapp-env";
import { debugToken, discoverWabaId, listAllTemplates } from "./whatsapp-admin";

// Shared resolution for everything that manages Meta templates: the env plus
// the ids saved on the setup page, the account id (discovered when needed)
// and the app id (needed for media uploads).

export interface TemplateEnv {
  env: WhatsAppEnv;
  wabaId: string | null;
  appId: string | null;
  /** Why the account could not be determined, when it could not. */
  wabaNotes: string[];
}

export async function resolveTemplateEnv(): Promise<TemplateEnv> {
  const settings = await getSettings();
  const env = withStoredAppId(
    withStoredBusinessAccountId(whatsappEnv(), settings.messaging.whatsapp_business_account_id),
    settings.messaging.whatsapp_app_id
  );
  if (!env.accessToken) return { env, wabaId: env.businessAccountId, appId: env.appId, wabaNotes: ["WHATSAPP_ACCESS_TOKEN is not set"] };
  const token = await debugToken(env);
  const discovery = await discoverWabaId(env, token.ok ? token.data : null);
  return {
    env,
    wabaId: discovery.wabaId,
    appId: env.appId ?? (token.ok ? token.data.appId : null),
    wabaNotes: discovery.notes,
  };
}

export interface TemplatesIndex {
  templates: MetaTemplateSummary[];
  wabaId: string | null;
  appIdKnown: boolean;
  error: string | null;
}

export async function loadTemplatesIndex(): Promise<TemplatesIndex> {
  const t = await resolveTemplateEnv();
  if (!t.wabaId) {
    return { templates: [], wabaId: null, appIdKnown: Boolean(t.appId), error: `WhatsApp Business Account unknown (${t.wabaNotes.join("; ")}). Set it on the WhatsApp setup page.` };
  }
  const r = await listAllTemplates(t.wabaId, t.env);
  if (!r.ok) return { templates: [], wabaId: t.wabaId, appIdKnown: Boolean(t.appId), error: r.error };
  return { templates: r.data, wabaId: t.wabaId, appIdKnown: Boolean(t.appId), error: null };
}
