import { createAdminClient } from "@/lib/supabase/admin";
import { FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { guardPage, isIsoDateParam, loadErrorMessage, param } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { BOOKING_STATUSES } from "@/components/admin/shared";
import {
  ReservationsView,
  PAGE_SIZE,
  type ReservationRow,
  type ReservationsFilters,
} from "@/components/admin/reservations/reservations-view";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const ROW_SELECT =
  "id, ref, guest_name, guest_phone, guest_email, room_type_id, room_id, check_in, check_out, nights, adults, children, status, source, total_omr, created_at, room_type:bk_room_types(name_en, name_ar), room:bk_rooms(room_number)";

/** Escape a user string for PostgREST `or(...ilike...)` filters. */
function likeTerm(q: string): string {
  return `%${q.replace(/[%_,().\\"':]/g, " ").replace(/\s+/g, " ").trim()}%`;
}

export default async function ReservationsPage({ searchParams }: { searchParams: Search }) {
  const session = await guardPage(FRONT_DESK_ROLES);
  if (!session) return <NoAccess title="Reservations" />;

  const statusParam = param(searchParams.status) ?? "";
  const statuses = statusParam
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is (typeof BOOKING_STATUSES)[number] => (BOOKING_STATUSES as string[]).includes(s));
  const fromParam = param(searchParams.from);
  const toParam = param(searchParams.to);
  const filters: ReservationsFilters = {
    statuses,
    from: isIsoDateParam(fromParam) ? fromParam : "",
    to: isIsoDateParam(toParam) ? toParam : "",
    type: param(searchParams.type) ?? "",
    q: (param(searchParams.q) ?? "").slice(0, 80),
    page: Math.max(1, parseInt(param(searchParams.page) ?? "1", 10) || 1),
  };

  try {
    const admin = createAdminClient();
    let query = admin.from("bk_bookings").select(ROW_SELECT, { count: "exact" });
    if (filters.statuses.length > 0) query = query.in("status", filters.statuses);
    if (filters.from) query = query.gte("check_in", filters.from);
    if (filters.to) query = query.lte("check_in", filters.to);
    if (filters.type) query = query.eq("room_type_id", filters.type);
    if (filters.q) {
      const term = likeTerm(filters.q);
      query = query.or(`guest_name.ilike.${term},guest_phone.ilike.${term},ref.ilike.${term}`);
    }
    const offset = (filters.page - 1) * PAGE_SIZE;
    const [rows, types] = await Promise.all([
      query.order("check_in", { ascending: true }).order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1),
      admin.from("bk_room_types").select("id, name_en, name_ar, sort_order").order("sort_order"),
    ]);
    if (rows.error) throw new Error(rows.error.message);
    if (types.error) throw new Error(types.error.message);

    const data: ReservationRow[] = (rows.data ?? []).map((r) => ({
      ...r,
      total_omr: Number(r.total_omr),
      room_type: Array.isArray(r.room_type) ? (r.room_type[0] ?? null) : r.room_type,
      room: Array.isArray(r.room) ? (r.room[0] ?? null) : r.room,
    }));

    return (
      <ReservationsView
        rows={data}
        total={rows.count ?? 0}
        filters={filters}
        types={types.data ?? []}
        role={session.role}
      />
    );
  } catch (e) {
    return <LoadError title="Reservations" message={loadErrorMessage(e)} />;
  }
}
