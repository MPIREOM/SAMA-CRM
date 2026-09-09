import { ADMIN_ROLES } from "@/lib/bk/staff";
import { getSettings } from "@/lib/bk/settings";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { loadWhatsAppSetup } from "@/lib/whatsapp-setup";
import { WhatsAppSetupView } from "@/components/admin/messaging/whatsapp-setup-view";

export const dynamic = "force-dynamic";

export default async function WhatsAppSetupPage() {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="WhatsApp setup" />;

  try {
    const settings = await getSettings();
    const status = await loadWhatsAppSetup(settings.messaging.whatsapp_templates);
    return (
      <WhatsAppSetupView
        status={status}
        publicWhatsApp={settings.contact.whatsapp}
        whatsappEnabled={settings.messaging.whatsapp_enabled}
      />
    );
  } catch (e) {
    return <LoadError title="WhatsApp setup" message={loadErrorMessage(e)} />;
  }
}
