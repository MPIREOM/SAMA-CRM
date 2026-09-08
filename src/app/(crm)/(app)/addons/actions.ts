"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, ADMIN_ROLES } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import type { Json } from "@/lib/database.types";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";

// Add-on catalogue (bk_addons): super_admin only. Every mutation:
// requireStaff(ADMIN_ROLES) → Zod → service-role write → audit → revalidate.
// Rows are never deleted (booked lines reference them) — deactivate instead.

const uuid = z.string().uuid();

/** Pages that read the catalogue (guest pages are force-dynamic and need no revalidation). */
function revalidateAddons() {
  for (const p of ["/addons", "/reservations/new", "/reservations", "/dashboard"]) revalidatePath(p);
}

const AddonSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and hyphens"),
  kind: z.enum(["activity", "transfer", "other"]),
  name_en: z.string().trim().min(1).max(160),
  name_ar: z.string().trim().min(1).max(160),
  tagline_en: z.string().trim().max(300).nullable(),
  tagline_ar: z.string().trim().max(300).nullable(),
  description_en: z.string().trim().max(4000).nullable(),
  description_ar: z.string().trim().max(4000).nullable(),
  price_omr: z.number().min(0).max(100000),
  unit: z.enum(["per_person", "per_car", "per_booking", "per_night"]),
  max_quantity: z.number().int().min(1).max(50),
  taxable: z.boolean(),
  requires_note: z.boolean(),
  note_hint_en: z.string().trim().max(300).nullable(),
  note_hint_ar: z.string().trim().max(300).nullable(),
  image: z.string().trim().max(500).nullable(),
  /** JSON text from the dialog's textarea — must parse to an object. */
  details: z.string().trim().max(8000),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(10000),
});

type AddonInput = z.infer<typeof AddonSchema>;

/** Parse the details textarea; only a JSON object is accepted (the column is jsonb `{}` by default). */
function parseDetails(text: string): { ok: true; value: Record<string, Json> } | { ok: false } {
  if (text === "") return { ok: true, value: {} };
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ok: true, value: parsed as Record<string, Json> };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

function toRow(data: AddonInput, details: Record<string, Json>) {
  return {
    slug: data.slug,
    kind: data.kind,
    name_en: data.name_en,
    name_ar: data.name_ar,
    tagline_en: data.tagline_en || null,
    tagline_ar: data.tagline_ar || null,
    description_en: data.description_en || null,
    description_ar: data.description_ar || null,
    price_omr: data.price_omr,
    unit: data.unit,
    max_quantity: data.max_quantity,
    taxable: data.taxable,
    requires_note: data.requires_note,
    note_hint_en: data.note_hint_en || null,
    note_hint_ar: data.note_hint_ar || null,
    image: data.image || null,
    details: details as Json,
    is_active: data.is_active,
    sort_order: data.sort_order,
  };
}

export async function createAddon(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("addon.create", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const data = AddonSchema.parse(input);
    const details = parseDetails(data.details);
    if (!details.ok) return { ok: false, error: "invalid_json" };
    const admin = createAdminClient();
    const row = toRow(data, details.value);
    const { data: created, error } = await admin.from("bk_addons").insert(row).select("id").single();
    if (error) return { ok: false, error: error.code === "23505" ? "slug_taken" : error.message };
    await audit(actor, "addon.create", "bk_addons", created.id, row);
    revalidateAddons();
    return { ok: true, data: { id: created.id } };
  });
}

const AddonUpdateSchema = AddonSchema.extend({ id: uuid });

export async function updateAddon(input: unknown): Promise<ActionResult> {
  return runAction("addon.update", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { id, ...data } = AddonUpdateSchema.parse(input);
    const details = parseDetails(data.details);
    if (!details.ok) return { ok: false, error: "invalid_json" };
    const admin = createAdminClient();
    const { data: before, error: readErr } = await admin.from("bk_addons").select("*").eq("id", id).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!before) return { ok: false, error: "addon_not_found" };
    const row = toRow(data, details.value);
    const { error } = await admin.from("bk_addons").update(row).eq("id", id);
    if (error) return { ok: false, error: error.code === "23505" ? "slug_taken" : error.message };
    const diff: Record<string, unknown> = {};
    for (const key of Object.keys(row) as (keyof typeof row)[]) {
      if (JSON.stringify(before[key]) !== JSON.stringify(row[key])) diff[key] = { from: before[key], to: row[key] };
    }
    await audit(actor, "addon.update", "bk_addons", id, diff);
    revalidateAddons();
    return { ok: true };
  });
}

const ActiveSchema = z.object({ id: uuid, is_active: z.boolean() });

/** Quick on/off from the table. Inactive add-ons disappear from the guest site and the staff form. */
export async function setAddonActive(input: unknown): Promise<ActionResult> {
  return runAction("addon.set_active", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { id, is_active } = ActiveSchema.parse(input);
    const admin = createAdminClient();
    const { data: before } = await admin.from("bk_addons").select("is_active").eq("id", id).maybeSingle();
    if (!before) return { ok: false, error: "addon_not_found" };
    const { error } = await admin.from("bk_addons").update({ is_active }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "addon.set_active", "bk_addons", id, { is_active: { from: before.is_active, to: is_active } });
    revalidateAddons();
    return { ok: true };
  });
}
