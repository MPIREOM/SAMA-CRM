"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, ADMIN_ROLES } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { getSettings, updateSetting } from "@/lib/bk/settings";
import type { AllSettings } from "@/lib/bk/types";
import { normalizePhone } from "@/lib/phone";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const url = z.string().trim().url().max(500).or(z.literal(""));

const SCHEMAS = {
  taxes: z.object({
    service_charge_pct: z.number().min(0).max(100),
    service_charge_enabled: z.boolean(),
    tourism_fee_pct: z.number().min(0).max(100),
    tourism_fee_enabled: z.boolean(),
    vat_pct: z.number().min(0).max(100),
    vat_enabled: z.boolean(),
    vat_on_fees: z.boolean(),
  }),
  times: z.object({ check_in: time, check_out: time }),
  cancellation: z.object({
    hours_before: z.number().int().min(0).max(24 * 60),
    policy_en: z.string().trim().max(2000),
    policy_ar: z.string().trim().max(2000),
  }),
  contact: z.object({
    phone: z.string().trim().max(30),
    whatsapp: z.string().trim().max(30),
    email: z.string().trim().email().max(200).or(z.literal("")),
    maps_link: url,
    address_en: z.string().trim().max(300),
    address_ar: z.string().trim().max(300),
    instagram: z.string().trim().max(200),
    website: url,
  }),
  reviews: z.object({ google: url, tripadvisor: url }),
  booking: z.object({
    max_nights: z.number().int().min(1).max(365),
    max_advance_days: z.number().int().min(1).max(1095),
    extra_bed_omr: z.number().min(0).max(1000),
    child_free_under: z.number().int().min(0).max(18),
    rate_limit_per_min: z.number().int().min(1).max(1000),
  }),
  messaging: z.object({
    pre_arrival_days_before: z.number().int().min(0).max(30),
    pre_arrival_time: time,
    post_stay_days_after: z.number().int().min(0).max(30),
    post_stay_time: time,
  }),
  promo: z.object({
    codes: z
      .array(
        z.object({
          code: z.string().trim().min(2).max(30).transform((c) => c.toUpperCase()),
          percent: z.number().min(0).max(100),
          valid_until: isoDate.nullable(),
          enabled: z.boolean(),
          note: z.string().trim().max(200).optional(),
        })
      )
      .max(100),
  }),
} as const;

export type EditableSettingsKey = keyof typeof SCHEMAS;

const KeySchema = z.enum(["taxes", "times", "cancellation", "contact", "reviews", "booking", "messaging", "promo"]);

export async function saveSettings(key: unknown, patch: unknown): Promise<ActionResult> {
  return runAction("settings.update", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const k = KeySchema.parse(key);
    const data = SCHEMAS[k].parse(patch) as Partial<AllSettings[typeof k]>;
    if (k === "contact") {
      const c = data as Partial<AllSettings["contact"]>;
      for (const field of ["phone", "whatsapp"] as const) {
        if (c[field]) {
          const normalised = normalizePhone(c[field]);
          if (!normalised) return { ok: false, error: `invalid_phone: ${field}` };
          c[field] = normalised;
        }
      }
    }
    if (k === "promo") {
      const codes = (data as AllSettings["promo"]).codes;
      const seen = new Set<string>();
      for (const c of codes) {
        if (seen.has(c.code)) return { ok: false, error: `Duplicate promo code ${c.code}` };
        seen.add(c.code);
      }
    }
    const before = (await getSettings())[k] as unknown as Record<string, unknown>;
    await updateSetting(k, data, actor.userId);
    const next = data as unknown as Record<string, unknown>;
    const diff: Record<string, unknown> = {};
    for (const field of Object.keys(next)) {
      if (JSON.stringify(before[field]) !== JSON.stringify(next[field])) diff[field] = { from: before[field], to: next[field] };
    }
    await audit(actor, "settings.update", "bk_settings", k, diff);
    for (const p of ["/settings", "/messaging", "/reservations/new", "/rates"]) revalidatePath(p);
    return { ok: true };
  });
}
