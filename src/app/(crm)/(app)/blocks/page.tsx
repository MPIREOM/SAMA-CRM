import { createAdminClient } from "@/lib/supabase/admin";
import { FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { muscatToday } from "@/lib/booking-engine/dates";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { BlocksView } from "@/components/admin/blocks/blocks-view";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const session = await guardPage(FRONT_DESK_ROLES);
  if (!session) return <NoAccess title="Blocks" />;

  try {
    const admin = createAdminClient();
    const [blocks, rooms, types] = await Promise.all([
      admin
        .from("bk_inventory_blocks")
        .select("id, room_id, room_type_id, start_date, end_date, kind, reason, created_at, room:bk_rooms(room_number, room_type_id)")
        .order("start_date", { ascending: true })
        .limit(500),
      admin.from("bk_rooms").select("id, room_number, room_type_id, status").order("sort_order").order("room_number"),
      admin.from("bk_room_types").select("id, name_en, name_ar, sort_order").order("sort_order"),
    ]);
    if (blocks.error) throw new Error(blocks.error.message);
    if (rooms.error) throw new Error(rooms.error.message);
    if (types.error) throw new Error(types.error.message);

    return (
      <BlocksView
        today={muscatToday()}
        role={session.role}
        blocks={(blocks.data ?? []).map((b) => {
          const room = Array.isArray(b.room) ? b.room[0] : b.room;
          return {
            id: b.id,
            room_id: b.room_id,
            room_type_id: b.room_type_id ?? room?.room_type_id ?? null,
            room_number: room?.room_number ?? null,
            start_date: b.start_date,
            end_date: b.end_date,
            kind: b.kind,
            reason: b.reason,
            created_at: b.created_at,
          };
        })}
        rooms={rooms.data ?? []}
        types={types.data ?? []}
      />
    );
  } catch (e) {
    return <LoadError title="Blocks" message={loadErrorMessage(e)} />;
  }
}
