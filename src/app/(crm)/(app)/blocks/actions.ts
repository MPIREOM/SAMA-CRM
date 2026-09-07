"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const uuid = z.string().uuid();

const PATHS = ["/blocks", "/calendar", "/rates", "/dashboard"];
function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

const CreateBlockSchema = z
  .object({
    room_id: uuid.nullable().optional(),
    room_type_id: uuid.nullable().optional(),
    start_date: isoDate,
    end_date: isoDate, // exclusive
    kind: z.enum(["block", "maintenance", "stop_sell"]),
    reason: z.string().trim().max(300).optional().nullable(),
  })
  .refine((v) => Boolean(v.room_id) || Boolean(v.room_type_id), { message: "Pick a room or a room type" });

export async function createBlock(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("block.create", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const data = CreateBlockSchema.parse(input);
    if (data.end_date <= data.start_date) return { ok: false, error: "invalid_dates" };
    const admin = createAdminClient();
    const roomId = data.room_id ?? null;
    const roomTypeId = roomId ? null : (data.room_type_id ?? null);
    if (roomId) {
      // A room-level block over a live stay would hide a real guest — refuse.
      const { count, error } = await admin
        .from("bk_bookings")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId)
        .not("status", "in", "(cancelled,no_show)")
        .lt("check_in", data.end_date)
        .gt("check_out", data.start_date);
      if (error) return { ok: false, error: error.message };
      if ((count ?? 0) > 0) return { ok: false, error: "overlap" };
    }
    const { data: row, error } = await admin
      .from("bk_inventory_blocks")
      .insert({
        room_id: roomId,
        room_type_id: roomTypeId,
        start_date: data.start_date,
        end_date: data.end_date,
        kind: data.kind,
        reason: data.reason || null,
        created_by: actor.userId,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    await audit(actor, "block.create", "bk_inventory_blocks", row.id, {
      room_id: roomId,
      room_type_id: roomTypeId,
      start_date: data.start_date,
      end_date: data.end_date,
      kind: data.kind,
      reason: data.reason ?? null,
    });
    revalidateAll();
    return { ok: true, data: { id: row.id } };
  });
}

const IdSchema = z.object({ id: uuid });

export async function deleteBlock(input: unknown): Promise<ActionResult> {
  return runAction("block.delete", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { id } = IdSchema.parse(input);
    const admin = createAdminClient();
    const { data: before } = await admin.from("bk_inventory_blocks").select("*").eq("id", id).maybeSingle();
    if (!before) return { ok: false, error: "Block not found." };
    const { error } = await admin.from("bk_inventory_blocks").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "block.delete", "bk_inventory_blocks", id, {
      room_id: before.room_id,
      room_type_id: before.room_type_id,
      start_date: before.start_date,
      end_date: before.end_date,
      kind: before.kind,
    });
    revalidateAll();
    return { ok: true };
  });
}
