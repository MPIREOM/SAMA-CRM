import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type { CategoryInventory } from "@/components/admin/blocks/blocks-view";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Per room category (room type): how many active rooms it has, how many are
 * free to sell for EVERY night of [start, end) — the same number the website
 * uses (bk_available_count: minus room blocks, bookings, and 0 if stop-sold) —
 * and whether a whole-category block already covers part of the range.
 */
export async function loadCategoryInventory(admin: Admin, typeIds: string[], start: string, end: string): Promise<CategoryInventory[]> {
  const [rooms, typeBlocks, counts] = await Promise.all([
    admin.from("bk_rooms").select("room_type_id").eq("status", "active"),
    admin.from("bk_inventory_blocks").select("room_type_id").is("room_id", null).lt("start_date", end).gt("end_date", start),
    Promise.all(
      typeIds.map((id) =>
        admin.rpc("bk_available_count", {
          p_room_type_id: id,
          p_check_in: start,
          p_check_out: end,
        }),
      ),
    ),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (typeBlocks.error) throw new Error(typeBlocks.error.message);

  const totals = new Map<string, number>();
  for (const r of rooms.data ?? []) totals.set(r.room_type_id, (totals.get(r.room_type_id) ?? 0) + 1);
  const blocked = new Set((typeBlocks.data ?? []).map((b) => b.room_type_id));

  return typeIds.map((id, i) => {
    const c = counts[i];
    if (c.error) throw new Error(c.error.message);
    return {
      room_type_id: id,
      total: totals.get(id) ?? 0,
      available: Number(c.data ?? 0),
      blocked: blocked.has(id),
    };
  });
}
