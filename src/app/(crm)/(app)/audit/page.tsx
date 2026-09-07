import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "@/lib/bk/staff";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { AuditView } from "@/components/admin/audit/audit-view";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Audit log" />;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("bk_audit_log").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return <AuditView rows={data ?? []} />;
  } catch (e) {
    return <LoadError title="Audit log" message={loadErrorMessage(e)} />;
  }
}
