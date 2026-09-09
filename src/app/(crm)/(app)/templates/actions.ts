"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";
import { resolveTemplateEnv } from "@/lib/whatsapp-templates";
import {
  createTemplateFromComponents,
  deleteTemplate,
  getTemplate,
  listAllTemplates,
  updateTemplateComponents,
  uploadMediaHandle,
} from "@/lib/whatsapp-admin";
import {
  EDITABLE_STATUSES,
  draftToComponents,
  validateDraft,
  type MetaTemplateSummary,
  type TemplateDraft,
} from "@/lib/messaging/meta-template-model";

// Server actions for the Templates page and the campaign composer. All
// super_admin only; every mutation is audited. Templates live in Meta — the
// CRM stores nothing about them except what a campaign needs to send.

const MEDIA_BUCKET = "wa-media";
/** Meta's resumable upload accepts exactly these (and WhatsApp headers need them too). */
const MEDIA_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "video/mp4": "mp4", "application/pdf": "pdf" };
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

function revalidateTemplates() {
  revalidatePath("/templates");
  revalidatePath("/campaigns/new");
}

const ButtonSchema = z.object({
  type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
  text: z.string().max(60),
  url: z.string().max(2000).optional(),
  urlExample: z.string().max(200).optional(),
  phone_number: z.string().max(30).optional(),
});

const DraftSchema = z.object({
  name: z.string().trim().max(512),
  language: z.string().trim().max(10),
  category: z.enum(["MARKETING", "UTILITY"]),
  header: z.object({
    format: z.enum(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"]),
    text: z.string().max(200),
    textExample: z.string().max(200),
    mediaHandle: z.string().max(2000),
    mediaUrl: z.string().max(2000),
  }),
  body: z.string().max(2000),
  bodyExamples: z.array(z.string().max(200)).max(50),
  footer: z.string().max(200),
  buttons: z.array(ButtonSchema).max(10),
});

const SaveSchema = z.object({ id: z.string().trim().max(40).nullable().optional(), draft: DraftSchema });

/** Every template on the account (for the Templates page refresh and the composer). */
export async function listMetaTemplates(): Promise<ActionResult<{ templates: MetaTemplateSummary[]; wabaId: string | null }>> {
  return runAction<{ templates: MetaTemplateSummary[]; wabaId: string | null }>("template.list", async () => {
    await requireStaff(ADMIN_ROLES);
    const t = await resolveTemplateEnv();
    if (!t.wabaId) return { ok: false, error: `WhatsApp Business Account unknown (${t.wabaNotes.join("; ")}). Set it on the WhatsApp setup page.` };
    const r = await listAllTemplates(t.wabaId, t.env);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: { templates: r.data, wabaId: t.wabaId } };
  });
}

/** Create a new template, or replace the components of an existing one (id given). */
export async function saveMetaTemplate(input: unknown): Promise<ActionResult<{ id: string | null; status: string | null; category: string | null }>> {
  return runAction<{ id: string | null; status: string | null; category: string | null }>("template.save", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { id, draft } = SaveSchema.parse(input) as { id?: string | null; draft: TemplateDraft };
    const issues = validateDraft(draft);
    if (issues.length > 0) return { ok: false, error: issues.join(" ") };
    const t = await resolveTemplateEnv();
    if (!t.wabaId) return { ok: false, error: `WhatsApp Business Account unknown (${t.wabaNotes.join("; ")}). Set it on the WhatsApp setup page.` };
    const components = draftToComponents(draft);

    if (id) {
      const existing = await getTemplate(id, t.env);
      if (!existing.ok) return { ok: false, error: existing.error };
      if (!EDITABLE_STATUSES.includes(existing.data.status)) {
        return { ok: false, error: `Only approved, rejected or paused templates can be edited — this one is ${existing.data.status}. Wait for Meta's review to finish.` };
      }
      const r = await updateTemplateComponents(id, components, t.env);
      if (!r.ok) return { ok: false, error: r.error };
      await audit(actor, "template.update", "meta_template", id, { name: existing.data.name, language: existing.data.language, category: draft.category });
      revalidateTemplates();
      return { ok: true, data: { id, status: "PENDING", category: existing.data.category } };
    }

    const r = await createTemplateFromComponents(t.wabaId, { name: draft.name, language: draft.language, category: draft.category, components }, t.env);
    if (!r.ok) return { ok: false, error: r.error };
    await audit(actor, "template.create", "meta_template", r.data.id, { name: draft.name, language: draft.language, category: r.data.category ?? draft.category, status: r.data.status });
    revalidateTemplates();
    return { ok: true, data: r.data };
  });
}

const DeleteSchema = z.object({ name: z.string().trim().min(1).max(512), id: z.string().trim().max(40).nullable().optional() });

/** Delete one language variant (id given) or every variant of the name. */
export async function deleteMetaTemplate(input: unknown): Promise<ActionResult> {
  return runAction("template.delete", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { name, id } = DeleteSchema.parse(input);
    const t = await resolveTemplateEnv();
    if (!t.wabaId) return { ok: false, error: "WhatsApp Business Account unknown. Set it on the WhatsApp setup page." };
    const r = await deleteTemplate(t.wabaId, name, id ?? null, t.env);
    if (!r.ok) return { ok: false, error: r.error };
    await audit(actor, "template.delete", "meta_template", id ?? name, { name, id: id ?? null });
    revalidateTemplates();
    return { ok: true };
  });
}

function mediaChecks(file: unknown): { ok: true; file: File; ext: string } | { ok: false; error: string } {
  if (!(file instanceof File)) return { ok: false, error: "No file received." };
  const ext = MEDIA_EXT[file.type];
  if (!ext) return { ok: false, error: "Only JPEG or PNG images, MP4 video or PDF documents are accepted." };
  if (file.size > MAX_MEDIA_BYTES) return { ok: false, error: "File is larger than 16 MB." };
  return { ok: true, file, ext };
}

async function storeMedia(file: File, ext: string, folder: string): Promise<{ url: string; path: string } | { error: string }> {
  const admin = createAdminClient();
  const safeBase = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) || "media";
  const path = `${folder}/${Date.now()}-${safeBase}.${ext}`;
  const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: error.message };
  return { url: admin.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl, path };
}

/**
 * Media for a template header: stored publicly (preview + default send-time
 * media) and uploaded to Meta for the sample handle the template needs.
 */
export async function uploadTemplateMedia(formData: FormData): Promise<ActionResult<{ handle: string; url: string }>> {
  return runAction<{ handle: string; url: string }>("template.upload_media", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const checked = mediaChecks(formData.get("file"));
    if (!checked.ok) return { ok: false, error: checked.error };
    const t = await resolveTemplateEnv();
    if (!t.appId) {
      return { ok: false, error: "Meta needs the app id to accept a media sample. Enter it on the WhatsApp setup page (Meta for Developers shows it at the top of the app dashboard) or set WHATSAPP_APP_ID in Vercel." };
    }
    const stored = await storeMedia(checked.file, checked.ext, "templates");
    if ("error" in stored) return { ok: false, error: stored.error };
    const bytes = await checked.file.arrayBuffer();
    const handle = await uploadMediaHandle(t.appId, { name: checked.file.name, type: checked.file.type, bytes }, t.env);
    if (!handle.ok) return { ok: false, error: `Stored the file, but Meta refused the sample upload: ${handle.error}` };
    await audit(actor, "template.upload_media", "meta_template", null, { path: stored.path, size: checked.file.size, type: checked.file.type });
    return { ok: true, data: { handle: handle.data.handle, url: stored.url } };
  });
}

/** Media sent as a campaign's header (public URL only — no Meta sample needed). */
export async function uploadCampaignMedia(formData: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction<{ url: string }>("campaign.upload_media", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const checked = mediaChecks(formData.get("file"));
    if (!checked.ok) return { ok: false, error: checked.error };
    const stored = await storeMedia(checked.file, checked.ext, "campaigns");
    if ("error" in stored) return { ok: false, error: stored.error };
    await audit(actor, "campaign.upload_media", "campaigns", null, { path: stored.path, size: checked.file.size, type: checked.file.type });
    return { ok: true, data: { url: stored.url } };
  });
}
