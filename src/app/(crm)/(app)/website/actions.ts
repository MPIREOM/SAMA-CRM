"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, ADMIN_ROLES } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { getSettings, updateSetting } from "@/lib/bk/settings";
import { SITE_COPY_FIELDS, SITE_IMAGE_SLOTS, SITE_SECTION_TOGGLES, isAllowedImageSrc, siteSlot } from "@/lib/bk/site-content";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";

// Website content (bk_settings.site): super_admin only. Every mutation:
// requireStaff(ADMIN_ROLES) → Zod → service-role write → audit → revalidate.
// Guest pages are force-dynamic / short ISR, so revalidating the locale
// roots is enough for the change to show on the next request.

const BUCKET = "bk-room-images";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const SLOT_KEYS = SITE_IMAGE_SLOTS.map((s) => s.key) as [string, ...string[]];
const COPY_KEYS = new Set(SITE_COPY_FIELDS.flatMap((f) => [`${f.key}_en`, `${f.key}_ar`]));
const SECTION_KEYS = new Set<string>(SITE_SECTION_TOGGLES.map((s) => s.key));

function revalidateSite() {
  for (const p of ["/website", "/en", "/ar"]) revalidatePath(p);
  revalidatePath("/[locale]", "layout");
}

const ImageSchema = z.object({
  key: z.enum(SLOT_KEYS),
  /** "" resets the slot to its built-in default. */
  src: z.string().trim().max(600),
});

/** Point a slot at a path from the built-in library, a storage URL, or "" for the default. */
export async function setSiteImage(input: unknown): Promise<ActionResult> {
  return runAction("site.image", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { key, src } = ImageSchema.parse(input);
    if (src !== "" && !isAllowedImageSrc(src)) return { ok: false, error: "Only uploads or paths under /images can be used." };
    const current = (await getSettings()).site;
    const images = { ...current.images };
    if (src === "") delete images[key];
    else images[key] = src;
    await updateSetting("site", { images }, actor.userId);
    await audit(actor, "site.image", "bk_settings", "site", { key, from: current.images[key] ?? null, to: src || null });
    revalidateSite();
    return { ok: true };
  });
}

/** Upload one image (FormData: key, file) to Storage and point the slot at it. */
export async function uploadSiteImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction("site.upload", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const key = z.enum(SLOT_KEYS).parse(formData.get("key"));
    const slot = siteSlot(key);
    if (!slot) return { ok: false, error: "Unknown photo slot." };
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "No file received." };
    if (!IMAGE_TYPES.includes(file.type)) return { ok: false, error: "Only JPEG, PNG, WebP or AVIF images are allowed." };
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image is larger than 8 MB." };
    const admin = createAdminClient();
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.slice(6);
    const safeBase = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) || "image";
    const path = `site/${key}-${Date.now()}-${safeBase}.${ext}`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
    const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const current = (await getSettings()).site;
    await updateSetting("site", { images: { ...current.images, [key]: url } }, actor.userId);
    await audit(actor, "site.upload", "bk_settings", "site", { key, path, url, size: file.size });
    revalidateSite();
    return { ok: true, data: { url } };
  });
}

const CopySchema = z.record(z.string(), z.string().max(1200));

/** Save the owner's copy overrides (all fields at once; empty strings clear a field). */
export async function saveSiteCopy(input: unknown): Promise<ActionResult> {
  return runAction("site.copy", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const patch = CopySchema.parse(input);
    const copy: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!COPY_KEYS.has(k)) continue;
      const clean = v.trim();
      if (clean) copy[k] = clean;
    }
    const before = (await getSettings()).site.copy;
    await updateSetting("site", { copy }, actor.userId);
    await audit(actor, "site.copy", "bk_settings", "site", { from: before, to: copy });
    revalidateSite();
    return { ok: true };
  });
}

const SectionsSchema = z.record(z.string(), z.boolean());

export async function saveSiteSections(input: unknown): Promise<ActionResult> {
  return runAction("site.sections", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const patch = SectionsSchema.parse(input);
    const sections: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(patch)) if (SECTION_KEYS.has(k)) sections[k] = v;
    const before = (await getSettings()).site.sections;
    await updateSetting("site", { sections }, actor.userId);
    await audit(actor, "site.sections", "bk_settings", "site", { from: before, to: sections });
    revalidateSite();
    return { ok: true };
  });
}
