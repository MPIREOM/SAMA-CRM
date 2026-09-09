import "server-only";

import type { MessageKind } from "@/lib/messaging/types";
import { metaTemplateDefinitions, templateBodyIssues } from "@/lib/messaging/templates/meta-templates";
import { whatsappEnv, webhookCallbackUrl, withStoredBusinessAccountId } from "./whatsapp-env";
import {
  debugToken,
  discoverWabaId,
  getAppSubscriptions,
  getPhoneNumber,
  getPhoneWebhookConfig,
  getWabaSubscribedApps,
  listTemplates,
  type TokenInfo,
} from "./whatsapp-admin";
import type { WhatsAppSetupStatus } from "@/components/admin/messaging/whatsapp-setup-types";

/**
 * Everything the setup page shows, gathered with tolerance: each Meta call
 * that fails becomes an error string on its own section instead of failing
 * the page.
 */
export async function loadWhatsAppSetup(
  templateNames: Record<MessageKind, string>,
  storedWabaId: string = ""
): Promise<WhatsAppSetupStatus> {
  const env = withStoredBusinessAccountId(whatsappEnv(), storedWabaId);
  const callbackUrl = webhookCallbackUrl();

  const [tokenRes, phoneRes] = await Promise.all([debugToken(env), getPhoneNumber(env)]);
  const token: TokenInfo | null = tokenRes.ok ? tokenRes.data : null;
  const discovery = await discoverWabaId(env, token);
  const wabaId = discovery.wabaId;
  const appId = env.appId ?? token?.appId ?? null;

  const [phoneHookRes, appsRes, appSubRes, templatesRes] = await Promise.all([
    getPhoneWebhookConfig(env),
    wabaId ? getWabaSubscribedApps(wabaId, env) : Promise.resolve(null),
    appId && env.appSecret ? getAppSubscriptions(appId, env) : Promise.resolve(null),
    wabaId ? listTemplates(wabaId, Object.values(templateNames), env) : Promise.resolve(null),
  ]);

  const apps = appsRes?.ok ? appsRes.data : [];
  const appCallback = appSubRes?.ok ? (appSubRes.data.find((s) => s.object === "whatsapp_business_account") ?? null) : null;
  const phoneHook = phoneHookRes.ok ? phoneHookRes.data : null;
  // Meta's precedence: phone override → account override → app callback.
  const effective = phoneHook
    ? (phoneHook.phoneNumber ?? phoneHook.whatsappBusinessAccount ?? phoneHook.application)
    : (apps.find((a) => a.overrideCallbackUri)?.overrideCallbackUri ?? appCallback?.callbackUrl ?? null);
  const pointsHere = effective === callbackUrl;

  const defs = metaTemplateDefinitions(templateNames);
  const found = templatesRes?.ok ? templatesRes.data : [];
  const rows = defs.map((d) => {
    const match = found.find((t) => t.name === d.name && t.language === d.language);
    return {
      kind: d.kind,
      name: d.name,
      language: d.language,
      status: match?.status ?? "MISSING",
      rejectedReason: match?.rejectedReason ?? null,
      issues: templateBodyIssues(d),
    };
  });

  return {
    env: {
      accessToken: Boolean(env.accessToken),
      phoneNumberId: Boolean(env.phoneNumberId),
      businessAccountId: Boolean(env.businessAccountId),
      appId: Boolean(env.appId),
      appSecret: Boolean(env.appSecret),
      verifyToken: Boolean(env.verifyToken),
      forwardUrl: env.forwardUrl,
      forwardSenders: env.forwardSenders,
    },
    callbackUrl,
    token: {
      ok: tokenRes.ok,
      error: tokenRes.ok ? null : tokenRes.error,
      appId,
      type: token?.type ?? null,
      expiresAt: token?.expiresAt ?? null,
      isValid: token?.isValid ?? false,
      scopes: token?.scopes ?? [],
    },
    phone: {
      ok: phoneRes.ok,
      error: phoneRes.ok ? null : phoneRes.error,
      id: phoneRes.ok ? phoneRes.data.id : env.phoneNumberId,
      displayPhoneNumber: phoneRes.ok ? phoneRes.data.displayPhoneNumber : null,
      verifiedName: phoneRes.ok ? phoneRes.data.verifiedName : null,
      qualityRating: phoneRes.ok ? phoneRes.data.qualityRating : null,
      codeVerificationStatus: phoneRes.ok ? phoneRes.data.codeVerificationStatus : null,
    },
    wabaId,
    wabaNotes: discovery.notes,
    storedWabaId,
    webhook: {
      ok: Boolean(appsRes?.ok),
      error: appsRes && !appsRes.ok ? appsRes.error : wabaId ? null : "WhatsApp Business Account id unknown",
      apps: apps.map((a) => ({ id: a.id, name: a.name, overrideCallbackUri: a.overrideCallbackUri })),
      appCallbackUrl: appCallback?.callbackUrl ?? null,
      appCallbackError: appSubRes && !appSubRes.ok ? appSubRes.error : null,
      pointsHere,
      phone: phoneHook,
      phoneError: phoneHookRes.ok ? null : phoneHookRes.error,
    },
    templates: {
      ok: Boolean(templatesRes?.ok),
      error: templatesRes && !templatesRes.ok ? templatesRes.error : wabaId ? null : "WhatsApp Business Account id unknown",
      rows,
    },
  };
}
