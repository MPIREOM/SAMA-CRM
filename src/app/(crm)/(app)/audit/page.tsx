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
    const [log, profiles] = await Promise.all([
      admin.from("bk_audit_log").select("*").order("created_at", { ascending: false }).limit(500),
      admin.from("profiles").select("id, full_name"),
    ]);
    if (log.error) throw new Error(log.error.message);
    // Rows written inside SQL (bk_cancel_booking) carry only actor_user_id —
    // resolve them to the staff member's name so "By" never shows a raw uuid.
    const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
    const rows = (log.data ?? []).map((r) =>
      r.actor_email || !r.actor_user_id ? r : { ...r, actor_email: names.get(r.actor_user_id) ?? r.actor_email }
    );
    return <AuditView rows={rows} />;
  } catch (e) {
    return <LoadError title="Audit log" message={loadErrorMessage(e)} />;
  }
}
