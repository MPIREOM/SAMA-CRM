import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "@/lib/bk/staff";
import { guardPage, loadErrorMessage, param } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { RoomsView } from "@/components/admin/rooms/rooms-view";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function RoomsPage({ searchParams }: { searchParams: Search }) {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Rooms" />;
  const tab = param(searchParams.tab) === "rooms" ? "rooms" : "types";

  try {
    const admin = createAdminClient();
    const [types, rooms] = await Promise.all([
      admin.from("bk_room_types").select("*").order("sort_order"),
      admin.from("bk_rooms").select("*").order("sort_order").order("room_number"),
    ]);
    if (types.error) throw new Error(types.error.message);
    if (rooms.error) throw new Error(rooms.error.message);
    return (
      <RoomsView
        tab={tab}
        types={(types.data ?? []).map((t) => ({
          ...t,
          base_rate_omr: Number(t.base_rate_omr),
          size_sqm: t.size_sqm === null ? null : Number(t.size_sqm),
          amenities: Array.isArray(t.amenities) ? t.amenities.filter((a): a is string => typeof a === "string") : [],
        }))}
        rooms={rooms.data ?? []}
      />
    );
  } catch (e) {
    return <LoadError title="Rooms" message={loadErrorMessage(e)} />;
  }
}
