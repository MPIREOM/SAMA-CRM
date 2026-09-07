"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, ADMIN_ROLES } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const uuid = z.string().uuid();

function revalidateAll() {
  for (const p of ["/rates", "/calendar", "/rooms", "/reservations/new", "/blocks"]) revalidatePath(p);
}

// ---------------------------------------------------------------------------
// Base rate (inline edit on the room type)
// ---------------------------------------------------------------------------

const BaseRateSchema = z.object({ room_type_id: uuid, base_rate_omr: z.number().min(0).max(100000) });

export async function setBaseRate(input: unknown): Promise<ActionResult> {
  return runAction("rate.base", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { room_type_id, base_rate_omr } = BaseRateSchema.parse(input);
    const admin = createAdminClient();
    const { data: before } = await admin.from("bk_room_types").select("base_rate_omr").eq("id", room_type_id).maybeSingle();
    if (!before) return { ok: false, error: "room_type_not_found" };
    const { error } = await admin.from("bk_room_types").update({ base_rate_omr }).eq("id", room_type_id);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "rate.base", "bk_room_types", room_type_id, { from: Number(before.base_rate_omr), to: base_rate_omr });
    revalidateAll();
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Rate plans
// ---------------------------------------------------------------------------

const PlanSchema = z
  .object({
    id: uuid.optional().nullable(),
    name: z.string().trim().min(1).max(120),
    room_type_id: uuid.nullable(),
    start_date: isoDate,
    end_date: isoDate, // inclusive
    rate_omr: z.number().min(0).max(100000).nullable(),
    adjust_pct: z.number().min(-100).max(1000).nullable(),
    min_stay: z.number().int().min(1).max(30),
    days_of_week: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
    priority: z.number().int().min(-1000).max(1000),
    is_active: z.boolean(),
  })
  .refine((v) => v.rate_omr !== null || v.adjust_pct !== null, { message: "Set a rate or an adjustment %" })
  .refine((v) => v.end_date >= v.start_date, { message: "End date must be on or after the start date" });

export async function saveRatePlan(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("rate_plan.save", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { id, ...data } = PlanSchema.parse(input);
    const admin = createAdminClient();
    const row = {
      ...data,
      // A fixed rate wins over an adjustment; keep only one to match the SQL semantics.
      adjust_pct: data.rate_omr !== null ? null : data.adjust_pct,
      days_of_week: data.days_of_week && data.days_of_week.length > 0 && data.days_of_week.length < 7 ? Array.from(new Set(data.days_of_week)).sort((a, b) => a - b) : null,
    };
    if (id) {
      const { data: before } = await admin.from("bk_rate_plans").select("*").eq("id", id).maybeSingle();
      if (!before) return { ok: false, error: "Rate plan not found." };
      const { error } = await admin.from("bk_rate_plans").update(row).eq("id", id);
      if (error) return { ok: false, error: error.message };
      const diff: Record<string, unknown> = {};
      for (const key of Object.keys(row) as (keyof typeof row)[]) {
        if (JSON.stringify(before[key]) !== JSON.stringify(row[key])) diff[key] = { from: before[key], to: row[key] };
      }
      await audit(actor, "rate_plan.update", "bk_rate_plans", id, diff);
      revalidateAll();
      return { ok: true, data: { id } };
    }
    const { data: created, error } = await admin
      .from("bk_rate_plans")
      .insert({ ...row, created_by: actor.userId })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    await audit(actor, "rate_plan.create", "bk_rate_plans", created.id, row);
    revalidateAll();
    return { ok: true, data: { id: created.id } };
  });
}

export async function deleteRatePlan(input: unknown): Promise<ActionResult> {
  return runAction("rate_plan.delete", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { id } = z.object({ id: uuid }).parse(input);
    const admin = createAdminClient();
    const { data: before } = await admin.from("bk_rate_plans").select("*").eq("id", id).maybeSingle();
    if (!before) return { ok: false, error: "Rate plan not found." };
    const { error } = await admin.from("bk_rate_plans").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "rate_plan.delete", "bk_rate_plans", id, { name: before.name, start_date: before.start_date, end_date: before.end_date });
    revalidateAll();
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Bulk set rate → one high-priority plan per selected type (or one "all" plan)
// ---------------------------------------------------------------------------

const BulkSchema = z
  .object({
    room_type_ids: z.array(uuid).max(50), // empty = all types
    start_date: isoDate,
    end_date: isoDate,
    rate_omr: z.number().min(0).max(100000).nullable(),
    adjust_pct: z.number().min(-100).max(1000).nullable(),
    days_of_week: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
    name: z.string().trim().max(120).optional(),
    min_stay: z.number().int().min(1).max(30).optional(),
  })
  .refine((v) => v.rate_omr !== null || v.adjust_pct !== null, { message: "Set a rate or an adjustment %" })
  .refine((v) => v.end_date >= v.start_date, { message: "End date must be on or after the start date" });

export async function bulkSetRate(input: unknown): Promise<ActionResult<{ created: number }>> {
  return runAction("rate_plan.bulk", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const data = BulkSchema.parse(input);
    const admin = createAdminClient();
    const days = data.days_of_week && data.days_of_week.length > 0 && data.days_of_week.length < 7 ? Array.from(new Set(data.days_of_week)).sort((a, b) => a - b) : null;
    const label =
      data.name?.trim() ||
      `Bulk ${data.rate_omr !== null ? `${data.rate_omr.toFixed(3)} OMR` : `${data.adjust_pct}%`} ${data.start_date} → ${data.end_date}`;
    const targets: (string | null)[] = data.room_type_ids.length > 0 ? data.room_type_ids : [null];
    const rows = targets.map((room_type_id) => ({
      name: label,
      room_type_id,
      start_date: data.start_date,
      end_date: data.end_date,
      rate_omr: data.rate_omr,
      adjust_pct: data.rate_omr !== null ? null : data.adjust_pct,
      min_stay: data.min_stay ?? 1,
      days_of_week: days,
      priority: 50,
      is_active: true,
      created_by: actor.userId,
    }));
    const { data: created, error } = await admin.from("bk_rate_plans").insert(rows).select("id");
    if (error) return { ok: false, error: error.message };
    await audit(actor, "rate_plan.bulk", "bk_rate_plans", null, { ids: (created ?? []).map((r) => r.id), ...data, name: label });
    revalidateAll();
    return { ok: true, data: { created: created?.length ?? 0 } };
  });
}

// ---------------------------------------------------------------------------
// Stop sell → type-level inventory block
// ---------------------------------------------------------------------------

const StopSellSchema = z
  .object({
    room_type_id: uuid,
    start_date: isoDate,
    end_date: isoDate, // exclusive (first sellable night again)
    reason: z.string().trim().max(300).optional().nullable(),
  })
  .refine((v) => v.end_date > v.start_date, { message: "End date must be after the start date" });

export async function stopSell(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("block.stop_sell", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const data = StopSellSchema.parse(input);
    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("bk_inventory_blocks")
      .insert({
        room_type_id: data.room_type_id,
        room_id: null,
        start_date: data.start_date,
        end_date: data.end_date,
        kind: "stop_sell",
        reason: data.reason || null,
        created_by: actor.userId,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    await audit(actor, "block.create", "bk_inventory_blocks", row.id, { ...data, kind: "stop_sell" });
    revalidateAll();
    return { ok: true, data: { id: row.id } };
  });
}
