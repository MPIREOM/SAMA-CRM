import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "@/lib/bk/staff";
import { muscatToday } from "@/lib/booking-engine/dates";
import { guardPage, loadErrorMessage, param } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { RatesView } from "@/components/admin/rates/rates-view";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function monthBounds(month: string): { start: string; endExclusive: string } {
  const [y, m] = month.split("-").map((v) => parseInt(v, 10));
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, endExclusive: next };
}

export default async function RatesPage({ searchParams }: { searchParams: Search }) {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Rates" />;

  const monthParam = param(searchParams.month);
  const month = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : muscatToday().slice(0, 7);
  const { start, endExclusive } = monthBounds(month);

  try {
    const admin = createAdminClient();
    const [types, plans, blocks] = await Promise.all([
      admin.from("bk_room_types").select("id, name_en, name_ar, base_rate_omr, sort_order, is_active").order("sort_order"),
      admin.from("bk_rate_plans").select("*").order("priority", { ascending: false }).order("start_date"),
      admin
        .from("bk_inventory_blocks")
        .select("id, room_id, room_type_id, start_date, end_date, kind, reason, room:bk_rooms(room_type_id)")
        .lt("start_date", endExclusive)
        .gt("end_date", start),
    ]);
    if (types.error) throw new Error(types.error.message);
    if (plans.error) throw new Error(plans.error.message);
    if (blocks.error) throw new Error(blocks.error.message);

    return (
      <RatesView
        month={month}
        today={muscatToday()}
        types={(types.data ?? []).map((t) => ({ ...t, base_rate_omr: Number(t.base_rate_omr) }))}
        plans={(plans.data ?? []).map((p) => ({
          ...p,
          rate_omr: p.rate_omr === null ? null : Number(p.rate_omr),
          adjust_pct: p.adjust_pct === null ? null : Number(p.adjust_pct),
        }))}
        blocks={(blocks.data ?? []).map((b) => {
          const room = Array.isArray(b.room) ? b.room[0] : b.room;
          return {
            id: b.id,
            room_id: b.room_id,
            room_type_id: b.room_type_id ?? room?.room_type_id ?? null,
            start_date: b.start_date,
            end_date: b.end_date,
            kind: b.kind,
            reason: b.reason,
          };
        })}
      />
    );
  } catch (e) {
    return <LoadError title="Rates" message={loadErrorMessage(e)} />;
  }
}
