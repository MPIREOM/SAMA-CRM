import { ADMIN_ROLES } from "@/lib/bk/staff";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { resolveTemplateEnv } from "@/lib/whatsapp-templates";
import { emptyDraft } from "@/lib/messaging/meta-template-model";
import { TemplateEditor } from "@/components/admin/templates/template-editor";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Templates" />;
  try {
    const t = await resolveTemplateEnv();
    return <TemplateEditor mode="create" initial={emptyDraft()} appIdKnown={Boolean(t.appId)} />;
  } catch (e) {
    return <LoadError title="Templates" message={loadErrorMessage(e)} />;
  }
}
