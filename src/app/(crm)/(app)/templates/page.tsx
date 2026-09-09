import { ADMIN_ROLES } from "@/lib/bk/staff";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { loadTemplatesIndex } from "@/lib/whatsapp-templates";
import { TemplatesView } from "@/components/admin/templates/templates-view";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Templates" />;
  try {
    const index = await loadTemplatesIndex();
    return <TemplatesView templates={index.templates} error={index.error} />;
  } catch (e) {
    return <LoadError title="Templates" message={loadErrorMessage(e)} />;
  }
}
