import { createAdminClient } from "@/lib/supabase/admin";
import { FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { muscatToday } from "@/lib/booking-engine/dates";
import { addDays } from "@/lib/booking-engine/pricing";
import { guardPage, isIsoDateParam, loadErrorMessage, param } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { NewBookingForm } from "@/components/admin/reservations/new-booking-form";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewReservationPage({ searchParams }: { searchParams: Search }) {
  const session = await guardPage(FRONT_DESK_ROLES);
  if (!session) return <NoAccess title="New booking" />;

  const today = muscatToday();
  const checkIn = param(searchParams.check_in);
  const checkOut = param(searchParams.check_out);
  const roomType = param(searchParams.room_type);
  const room = param(searchParams.room);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("bk_room_types")
      .select("id, name_en, name_ar, max_adults, max_children, base_rate_omr, is_active")
      .order("sort_order");
    if (error) throw new Error(error.message);
    const types = (data ?? []).map((t) => ({ ...t, base_rate_omr: Number(t.base_rate_omr) }));

    const initialIn = isIsoDateParam(checkIn) ? checkIn : today;
    const initialOut = isIsoDateParam(checkOut) && checkOut > initialIn ? checkOut : addDays(initialIn, 1);

    return (
      <NewBookingForm
        types={types}
        today={today}
        initial={{
          room_type_id: roomType && UUID.test(roomType) ? roomType : (types.find((t) => t.is_active)?.id ?? ""),
          room_id: room && UUID.test(room) ? room : "",
          check_in: initialIn,
          check_out: initialOut,
        }}
      />
    );
  } catch (e) {
    return <LoadError title="New booking" message={loadErrorMessage(e)} />;
  }
}
