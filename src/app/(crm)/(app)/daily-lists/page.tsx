import { createAdminClient } from "@/lib/supabase/admin";
import { FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { muscatToday } from "@/lib/booking-engine/dates";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { DailyListsView } from "@/components/admin/reports/daily-lists-view";
import { dailyRow, loadDailyLists } from "@/lib/analytics/reports";

export const dynamic = "force-dynamic";

export default async function DailyListsPage({ searchParams }: { searchParams: { date?: string } }) {
  const session = await guardPage(FRONT_DESK_ROLES);
  if (!session) return <NoAccess title="Arrivals & departures" />;
  try {
    const today = muscatToday();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : today;
    const lists = await loadDailyLists(createAdminClient(), date);
    const rows = (list: typeof lists.arrivals) => list.map((b) => ({ id: b.id, ...dailyRow(b) }));
    return <DailyListsView date={date} today={today} arrivals={rows(lists.arrivals)} departures={rows(lists.departures)} inHouse={rows(lists.inHouse)} />;
  } catch (e) {
    return <LoadError title="Arrivals & departures" message={loadErrorMessage(e)} />;
  }
}
