import { ADMIN_ROLES } from "@/lib/bk/staff";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { resolveTemplateEnv } from "@/lib/whatsapp-templates";
import { getTemplate } from "@/lib/whatsapp-admin";
import { componentsToDraft } from "@/lib/messaging/meta-template-model";
import { TemplateEditor } from "@/components/admin/templates/template-editor";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Templates" />;
  if (!/^\d{3,40}$/.test(params.id)) return <LoadError title="Templates" message="not_found" />;
  try {
    const t = await resolveTemplateEnv();
    const r = await getTemplate(params.id, t.env);
    if (!r.ok) return <LoadError title="Templates" message={r.error} />;
    return (
      <TemplateEditor
        mode="edit"
        templateId={r.data.id}
        status={r.data.status}
        rejectedReason={r.data.rejectedReason}
        initial={componentsToDraft(r.data)}
        appIdKnown={Boolean(t.appId)}
      />
    );
  } catch (e) {
    return <LoadError title="Templates" message={loadErrorMessage(e)} />;
  }
}
