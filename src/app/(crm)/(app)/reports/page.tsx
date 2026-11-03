import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "@/lib/bk/staff";
import { muscatToday } from "@/lib/booking-engine/dates";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { ReportsView } from "@/components/admin/reports/reports-view";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Reports" />;
  try {
    const admin = createAdminClient();
    const { data: types, error } = await admin.from("bk_room_types").select("id, name_en, name_ar").order("sort_order");
    if (error) throw new Error(error.message);
    const today = muscatToday();
    return <ReportsView today={today} monthStart={`${today.slice(0, 8)}01`} types={types ?? []} />;
  } catch (e) {
    return <LoadError title="Reports" message={loadErrorMessage(e)} />;
  }
}
