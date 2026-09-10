"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { getSettings, updateSetting } from "@/lib/bk/settings";
import { normalizePhone } from "@/lib/phone";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";
import { appBaseUrl, whatsappEnv, webhookCallbackUrl, withStoredBusinessAccountId, type WhatsAppEnv } from "@/lib/whatsapp-env";
import { resolveTemplateEnv } from "@/lib/whatsapp-templates";
import {
  createTemplate,
  createTemplateFromComponents,
  debugToken,
  discoverWabaId,
  getPhoneNumber,
  listTemplates,
  setPhoneWebhookOverride,
  setWabaWebhookOverride,
  updateTemplate,
  uploadMediaHandle,
  type TemplateStatus,
} from "@/lib/whatsapp-admin";
import { metaTemplateDefinitions, templateBodyIssues, type MetaTemplateDefinition } from "@/lib/messaging/templates/meta-templates";
import { MARKETING_PACK, MARKETING_PACK_NAMES, marketingPackDraft } from "@/lib/messaging/templates/marketing-pack";
import { draftToComponents, validateDraft, type MetaComponent } from "@/lib/messaging/meta-template-model";
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

const AppIdSchema = z.object({ id: z.string().trim().max(40) });

/**
 * Save the Meta app id from the setup page (needed to upload sample media for
 * template headers when the token does not reveal it). Empty clears it.
 */
export async function saveAppId(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>("whatsapp.app_id", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const raw = AppIdSchema.parse(input).id;
    const id = raw.replace(/\D/g, "");
    if (raw && id.length < 6) return { ok: false, error: "The Meta app id is a number of at least 6 digits." };
    await updateSetting("messaging", { whatsapp_app_id: id }, actor.userId);
    await audit(actor, "settings.update", "bk_settings", "messaging", { whatsapp_app_id: id });
    revalidateSetup();
    revalidatePath("/templates");
    return { ok: true, data: { id } };
  });
}

/**
 * Point this number's webhooks at this deployment. Phone-level override first
 * (needs only the phone number id); account-level override as a fallback when
 * Meta refuses the phone-level one and the account id is known.
 */
export async function registerWebhook(): Promise<ActionResult<{ callbackUrl: string; level: "phone" | "account" }>> {
  return runAction<{ callbackUrl: string; level: "phone" | "account" }>("whatsapp.webhook", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const env = await envWithStoredWaba();
    if (!env.accessToken) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN is not set in Vercel." };
    if (!env.phoneNumberId) return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID is not set in Vercel." };
    if (!env.verifyToken) {
      return { ok: false, error: "WHATSAPP_VERIFY_TOKEN (or WHATSAPP_WEBHOOK_VERIFY_TOKEN) is not set in Vercel." };
    }
    if (!env.appSecret) {
      return { ok: false, error: "WHATSAPP_APP_SECRET is not set — the webhook would reject every delivery." };
    }

    const callbackUrl = webhookCallbackUrl();
    const phone = await setPhoneWebhookOverride(callbackUrl, env.verifyToken, env);
    let level: "phone" | "account" = "phone";
    let wabaId: string | null = null;
    if (!phone.ok) {
      const waba = await wabaIdOrError(env);
      if ("error" in waba) {
        return { ok: false, error: `Phone-level override failed: ${phone.error}. Account-level fallback: ${waba.error}` };
      }
      const acct = await setWabaWebhookOverride(waba.wabaId, callbackUrl, env.verifyToken, env);
      if (!acct.ok) return { ok: false, error: `Phone-level override failed: ${phone.error}. Account-level override failed: ${acct.error}` };
      level = "account";
      wabaId = waba.wabaId;
    }

    await audit(actor, "whatsapp.webhook_override", "bk_settings", "messaging", {
      level,
      phone_number_id: env.phoneNumberId,
      waba_id: wabaId,
      callback_url: callbackUrl,
      forward_url: env.forwardUrl,
      forward_senders: env.forwardSenders.length,
    });
    revalidateSetup();
    return { ok: true, data: { callbackUrl, level } };
  });
}

/** The one BODY component a guest template is made of, with Meta's required examples. */
function bodyComponents(def: MetaTemplateDefinition): MetaComponent[] {
  return [{ type: "BODY", text: def.body, ...(def.examples.length > 0 ? { example: { body_text: [def.examples] } } : {}) }];
}

const RESUBMITTABLE = new Set(["APPROVED", "REJECTED", "PAUSED"]);

/** Push the code's current text + category to an existing Meta template; Meta reviews it again. */
async function resubmitDefinition(def: MetaTemplateDefinition, match: TemplateStatus, env: WhatsAppEnv): Promise<TemplateCreateOutcome> {
  const base = { name: def.name, language: def.language };
  if (!match.id) return { ...base, ok: false, status: match.status, error: "Meta returned no template id — resubmit from WhatsApp Manager.", action: "failed" };
  if (!RESUBMITTABLE.has(match.status)) {
    return { ...base, ok: false, status: match.status, error: `Only approved, rejected or paused templates can be resubmitted — this one is ${match.status}.`, action: "failed" };
  }
  const issues = templateBodyIssues(def);
  if (issues.length > 0) return { ...base, ok: false, status: match.status, error: issues.join("; "), action: "failed" };
  const r = await updateTemplate(match.id, { category: def.category, components: bodyComponents(def) }, env);
  return r.ok
    ? { ...base, ok: true, status: "PENDING", error: null, action: "resubmitted" }
    : { ...base, ok: false, status: match.status, error: r.error, action: "failed" };
}

/**
 * Bring the guest-messaging templates (3 kinds × en/ar) in line with the code:
 * create the missing ones, resubmit the rejected ones with the current text and
 * category. Approved templates are left alone (resubmitting one takes it out
 * of service until Meta approves it again — that is the per-row action).
 */
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
        if (match.status === "REJECTED") {
          results.push(await resubmitDefinition(def, match, env));
        } else {
          results.push({ name: def.name, language: def.language, ok: true, status: match.status, error: null, action: "unchanged" });
        }
        continue;
      }
      const issues = templateBodyIssues(def);
      if (issues.length > 0) {
        results.push({ name: def.name, language: def.language, ok: false, status: null, error: issues.join("; "), action: "failed" });
        continue;
      }
      const r = await createTemplate(waba.wabaId, def, env);
      results.push(
        r.ok
          ? { name: def.name, language: def.language, ok: true, status: r.data.status ?? "PENDING", error: null, action: "created" }
          : { name: def.name, language: def.language, ok: false, status: null, error: r.error, action: "failed" }
      );
    }

    await audit(actor, "whatsapp.templates_submit", "bk_settings", "messaging", {
      waba_id: waba.wabaId,
      created: results.filter((r) => r.action === "created").length,
      resubmitted: results.filter((r) => r.action === "resubmitted").length,
      failed: results.filter((r) => !r.ok).length,
    });
    revalidateSetup();
    return { ok: true, data: { results } };
  });
}

/**
 * Header image of a pack template as bytes: from the deployed bundle when the
 * file was traced into it, otherwise over HTTP from this deployment's public
 * URL (the same URL Meta fetches at send time).
 */
async function packImageBytes(publicPath: string): Promise<ArrayBuffer | { error: string }> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", publicPath));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    // not in the function bundle — fall through
  }
  const url = `${appBaseUrl()}${publicPath}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { error: `Could not load ${url} (HTTP ${res.status}).` };
    return await res.arrayBuffer();
  } catch (e) {
    return { error: `Could not load ${url}: ${(e as Error).message}` };
  }
}

/**
 * Submit the marketing template pack (marketing-pack.ts) to Meta: every
 * missing variant is created, every rejected one is resubmitted with the
 * pack's current text; approved, pending and paused ones are left alone. Each
 * submission uploads the header image as Meta's sample first.
 */
export async function createMarketingTemplates(): Promise<ActionResult<{ results: TemplateCreateOutcome[] }>> {
  return runAction<{ results: TemplateCreateOutcome[] }>("whatsapp.marketing_templates", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const t = await resolveTemplateEnv();
    if (!t.env.accessToken) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN is not set in Vercel." };
    if (!t.wabaId) return { ok: false, error: `WhatsApp Business Account unknown (${t.wabaNotes.join("; ")}). Paste it into the field above and save.` };
    if (!t.appId) {
      return { ok: false, error: "Meta needs the app id to accept the header images. Enter it in the “Meta app ID” field above (Meta for Developers shows it at the top of the app dashboard) or set WHATSAPP_APP_ID in Vercel." };
    }
    const existing = await listTemplates(t.wabaId, MARKETING_PACK_NAMES, t.env);
    if (!existing.ok) return { ok: false, error: existing.error };

    const results: TemplateCreateOutcome[] = [];
    const handles = new Map<string, string>(); // one Meta upload per image, shared by both languages
    for (const tpl of MARKETING_PACK) {
      for (const v of tpl.variants) {
        const base = { name: tpl.name, language: v.language };
        const match = existing.data.find((m) => m.name === tpl.name && m.language === v.language);
        if (match && match.status !== "REJECTED") {
          results.push({ ...base, ok: true, status: match.status, error: null, action: "unchanged" });
          continue;
        }
        if (match && !match.id) {
          results.push({ ...base, ok: false, status: match.status, error: "Meta returned no template id — resubmit from WhatsApp Manager.", action: "failed" });
          continue;
        }

        let handle = handles.get(tpl.headerImage);
        if (!handle) {
          const bytes = await packImageBytes(tpl.headerImage);
          if (!(bytes instanceof ArrayBuffer)) {
            results.push({ ...base, ok: false, status: match?.status ?? null, error: bytes.error, action: "failed" });
            continue;
          }
          const up = await uploadMediaHandle(t.appId, { name: path.basename(tpl.headerImage), type: "image/jpeg", bytes }, t.env);
          if (!up.ok) {
            results.push({ ...base, ok: false, status: match?.status ?? null, error: `Meta refused the header image: ${up.error}`, action: "failed" });
            continue;
          }
          handle = up.data.handle;
          handles.set(tpl.headerImage, handle);
        }

        const draft = marketingPackDraft(tpl, v, handle, `${appBaseUrl()}${tpl.headerImage}`);
        const issues = validateDraft(draft);
        if (issues.length > 0) {
          results.push({ ...base, ok: false, status: match?.status ?? null, error: issues.join(" "), action: "failed" });
          continue;
        }
        const components = draftToComponents(draft);
        if (match) {
          const r = await updateTemplate(match.id!, { category: "MARKETING", components }, t.env);
          results.push(
            r.ok
              ? { ...base, ok: true, status: "PENDING", error: null, action: "resubmitted" }
              : { ...base, ok: false, status: match.status, error: r.error, action: "failed" }
          );
        } else {
          const r = await createTemplateFromComponents(t.wabaId, { name: tpl.name, language: v.language, category: "MARKETING", components }, t.env);
          results.push(
            r.ok
              ? { ...base, ok: true, status: r.data.status ?? "PENDING", error: null, action: "created" }
              : { ...base, ok: false, status: null, error: r.error, action: "failed" }
          );
        }
      }
    }

    await audit(actor, "whatsapp.marketing_templates_submit", "bk_settings", "messaging", {
      waba_id: t.wabaId,
      created: results.filter((r) => r.action === "created").length,
      resubmitted: results.filter((r) => r.action === "resubmitted").length,
      failed: results.filter((r) => !r.ok).length,
    });
    revalidateSetup();
    revalidatePath("/templates");
    revalidatePath("/campaigns/new");
    return { ok: true, data: { results } };
  });
}

const ResubmitSchema = z.object({ name: z.string().trim().min(1).max(512), language: z.string().trim().min(2).max(10) });

/**
 * Resubmit one guest template with the code's current text and category —
 * for an approved template whose text or category drifted from the code, or a
 * rejected one. The template is unavailable until Meta approves it again.
 */
export async function resubmitTemplate(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runAction<{ status: string }>("whatsapp.template_resubmit", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { name, language } = ResubmitSchema.parse(input);
    const env = await envWithStoredWaba();
    const waba = await wabaIdOrError(env);
    if ("error" in waba) return { ok: false, error: waba.error };
    const settings = await getSettings();
    const def = metaTemplateDefinitions(settings.messaging.whatsapp_templates).find((d) => d.name === name && d.language === language);
    if (!def) return { ok: false, error: "This template is not one of the guest-messaging templates." };
    const existing = await listTemplates(waba.wabaId, [def.name], env);
    if (!existing.ok) return { ok: false, error: existing.error };
    const match = existing.data.find((t) => t.name === def.name && t.language === def.language);
    if (!match) return { ok: false, error: "Meta has no template with this name and language — use “Create / resubmit templates”." };
    const outcome = await resubmitDefinition(def, match, env);
    if (!outcome.ok) return { ok: false, error: outcome.error ?? "Meta refused the update." };
    await audit(actor, "whatsapp.template_resubmit", "meta_template", match.id, { name: def.name, language: def.language, category: def.category, previous_status: match.status });
    revalidateSetup();
    revalidatePath("/templates");
    return { ok: true, data: { status: outcome.status ?? "PENDING" } };
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
