import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "@/lib/bk/staff";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { AddonsView } from "@/components/admin/addons/addons-view";

export const dynamic = "force-dynamic";

/** Add-on catalogue (APEX Zipline, 4WD transfers…) — super_admin only. */
export default async function AddonsPage() {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Add-ons" />;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("bk_addons").select("*").order("sort_order").order("name_en");
    if (error) throw new Error(error.message);
    return (
      <AddonsView
        addons={(data ?? []).map((a) => ({
          ...a,
          price_omr: Number(a.price_omr),
          details: a.details && typeof a.details === "object" && !Array.isArray(a.details) ? a.details : {},
        }))}
      />
    );
  } catch (e) {
    return <LoadError title="Add-ons" message={loadErrorMessage(e)} />;
  }
}
