"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { getSettings, updateSetting } from "@/lib/bk/settings";
import { normalizePhone } from "@/lib/phone";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";
import { whatsappEnv, webhookCallbackUrl, withStoredBusinessAccountId, type WhatsAppEnv } from "@/lib/whatsapp-env";
import {
  createTemplate,
  debugToken,
  discoverWabaId,
  getPhoneNumber,
  listTemplates,
  setWabaWebhookOverride,
} from "@/lib/whatsapp-admin";
import { metaTemplateDefinitions, templateBodyIssues } from "@/lib/messaging/templates/meta-templates";
import type { TemplateCreateOutcome } from "@/components/admin/messaging/whatsapp-setup-types";

// Server actions behind the back-office WhatsApp setup page. super_admin only.
// They talk to Meta with the credentials in the environment and never expose
// them to the browser.

function revalidateSetup() {
  revalidatePath("/messaging/whatsapp");
  revalidatePath("/messaging");
}

/** Environment plus the account id saved on the setup page (no redeploy needed). */
async function envWithStoredWaba(): Promise<WhatsAppEnv> {
  const settings = await getSettings();
  return withStoredBusinessAccountId(whatsappEnv(), settings.messaging.whatsapp_business_account_id);
}

async function wabaIdOrError(env: WhatsAppEnv): Promise<{ wabaId: string } | { error: string }> {
  if (!env.accessToken) return { error: "WHATSAPP_ACCESS_TOKEN is not set in Vercel." };
  const token = await debugToken(env);
  const found = await discoverWabaId(env, token.ok ? token.data : null);
  if (!found.wabaId) {
    return {
      error:
        "Could not determine the WhatsApp Business Account id from the token. Paste it into the “WhatsApp Business Account ID” field on this page (Meta → WhatsApp → API Setup shows it next to the phone number id) and save. " +
        `Discovery: ${found.notes.join("; ")}.`,
    };
  }
  return { wabaId: found.wabaId };
}

const WabaSchema = z.object({ id: z.string().trim().max(40) });

/** Save the WhatsApp Business Account id from the setup page. Empty clears it. */
export async function saveBusinessAccountId(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>("whatsapp.waba_id", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const raw = WabaSchema.parse(input).id;
    const id = raw.replace(/\D/g, "");
    if (raw && id.length < 6) return { ok: false, error: "The WhatsApp Business Account id is a number of at least 6 digits." };
    await updateSetting("messaging", { whatsapp_business_account_id: id }, actor.userId);
    await audit(actor, "settings.update", "bk_settings", "messaging", { whatsapp_business_account_id: id });
    revalidateSetup();
    return { ok: true, data: { id } };
  });
}

/** Point this WhatsApp Business Account's webhooks at this deployment (WABA-level override). */
export async function registerWebhook(): Promise<ActionResult<{ callbackUrl: string; wabaId: string }>> {
  return runAction<{ callbackUrl: string; wabaId: string }>("whatsapp.webhook", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const env = await envWithStoredWaba();
    if (!env.verifyToken) {
      return { ok: false, error: "WHATSAPP_VERIFY_TOKEN (or WHATSAPP_WEBHOOK_VERIFY_TOKEN) is not set in Vercel." };
    }
    if (!env.appSecret) {
      return { ok: false, error: "WHATSAPP_APP_SECRET is not set — the webhook would reject every delivery." };
    }
    const waba = await wabaIdOrError(env);
    if ("error" in waba) return { ok: false, error: waba.error };

    const callbackUrl = webhookCallbackUrl();
    const r = await setWabaWebhookOverride(waba.wabaId, callbackUrl, env.verifyToken, env);
    if (!r.ok) return { ok: false, error: r.error };

    await audit(actor, "whatsapp.webhook_override", "bk_settings", "messaging", {
      waba_id: waba.wabaId,
      callback_url: callbackUrl,
      forward_url: env.forwardUrl,
      forward_senders: env.forwardSenders.length,
    });
    revalidateSetup();
    return { ok: true, data: { callbackUrl, wabaId: waba.wabaId } };
  });
}

/** Submit every guest-messaging template that does not exist yet (3 kinds × en/ar). */
export async function createMissingTemplates(): Promise<ActionResult<{ results: TemplateCreateOutcome[] }>> {
  return runAction<{ results: TemplateCreateOutcome[] }>("whatsapp.templates", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const env = await envWithStoredWaba();
    const waba = await wabaIdOrError(env);
    if ("error" in waba) return { ok: false, error: waba.error };

    const settings = await getSettings();
    const defs = metaTemplateDefinitions(settings.messaging.whatsapp_templates);
    const existing = await listTemplates(waba.wabaId, Array.from(new Set(defs.map((d) => d.name))), env);
    if (!existing.ok) return { ok: false, error: existing.error };

    const results: TemplateCreateOutcome[] = [];
    for (const def of defs) {
      const match = existing.data.find((t) => t.name === def.name && t.language === def.language);
      if (match) {
        results.push({
          name: def.name,
          language: def.language,
          ok: match.status !== "REJECTED",
          status: match.status,
          error:
            match.status === "REJECTED"
              ? `Rejected in Meta (${match.rejectedReason ?? "no reason given"}) — edit or delete it in WhatsApp Manager, then create again.`
              : null,
        });
        continue;
      }
      const issues = templateBodyIssues(def);
      if (issues.length > 0) {
        results.push({ name: def.name, language: def.language, ok: false, status: null, error: issues.join("; ") });
        continue;
      }
      const r = await createTemplate(waba.wabaId, def, env);
      results.push(
        r.ok
          ? { name: def.name, language: def.language, ok: true, status: r.data.status ?? "PENDING", error: null }
          : { name: def.name, language: def.language, ok: false, status: null, error: r.error }
      );
    }

    await audit(actor, "whatsapp.templates_submit", "bk_settings", "messaging", {
      waba_id: waba.wabaId,
      created: results.filter((r) => r.ok && r.status === "PENDING").length,
      failed: results.filter((r) => !r.ok).length,
    });
    revalidateSetup();
    return { ok: true, data: { results } };
  });
}

/** Make the number behind the Cloud API the one the guest site shows for "Chat on WhatsApp". */
export async function adoptPublicNumber(): Promise<ActionResult<{ whatsapp: string }>> {
  return runAction<{ whatsapp: string }>("whatsapp.adopt_number", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const env = whatsappEnv();
    const phone = await getPhoneNumber(env);
    if (!phone.ok) return { ok: false, error: phone.error };
    const whatsapp = normalizePhone(phone.data.displayPhoneNumber ?? "");
    if (!whatsapp) return { ok: false, error: `Meta returned an unusable display number: ${phone.data.displayPhoneNumber ?? "(empty)"}` };
    const before = (await getSettings()).contact.whatsapp;
    await updateSetting("contact", { whatsapp }, actor.userId);
    await audit(actor, "settings.update", "bk_settings", "contact", { whatsapp, from: before });
    revalidateSetup();
    revalidatePath("/settings");
    return { ok: true, data: { whatsapp } };
  });
}
