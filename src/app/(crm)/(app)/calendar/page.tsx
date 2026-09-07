import { createAdminClient } from "@/lib/supabase/admin";
import { FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { addDays } from "@/lib/booking-engine/pricing";
import { muscatToday } from "@/lib/booking-engine/dates";
import { guardPage, isIsoDateParam, loadErrorMessage, param } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { CalendarView } from "@/components/admin/calendar/calendar-view";
import { clampDays } from "@/components/admin/calendar/layout";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

// Tape chart: rooms × days. Four service-role queries for the visible window;
// the grid itself is a client component fed with plain JSON.
export default async function CalendarPage({ searchParams }: { searchParams: Search }) {
  const session = await guardPage(FRONT_DESK_ROLES);
  if (!session) return <NoAccess title="Calendar" />;

  const today = muscatToday();
  const fromParam = param(searchParams.from);
  const from = isIsoDateParam(fromParam) ? fromParam : addDays(today, -1);
  const days = clampDays(Number(param(searchParams.days)));
  const to = addDays(from, days);

  try {
    const admin = createAdminClient();
    const [types, rooms, bookings, blocks] = await Promise.all([
      admin.from("bk_room_types").select("id, slug, name_en, name_ar, sort_order, is_active").order("sort_order"),
      admin.from("bk_rooms").select("id, room_number, room_type_id, floor, status, sort_order").order("sort_order"),
      admin
        .from("bk_bookings")
        .select(
          "id, ref, guest_name, guest_phone, room_type_id, room_id, check_in, check_out, status, adults, children, total_omr, source, special_requests, internal_notes"
        )
        .lt("check_in", to)
        .gt("check_out", from)
        .not("status", "in", "(cancelled,no_show)")
        .order("check_in"),
      admin
        .from("bk_inventory_blocks")
        .select("id, room_id, room_type_id, start_date, end_date, kind, reason")
        .lt("start_date", to)
        .gt("end_date", from),
    ]);
    const failed = [types, rooms, bookings, blocks].find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    return (
      <CalendarView
        from={from}
        days={days}
        today={today}
        role={session.role}
        types={types.data ?? []}
        rooms={rooms.data ?? []}
        bookings={(bookings.data ?? []).map((b) => ({ ...b, total_omr: Number(b.total_omr) }))}
        blocks={blocks.data ?? []}
      />
    );
  } catch (e) {
    return <LoadError title="Calendar" message={loadErrorMessage(e)} />;
  }
}
