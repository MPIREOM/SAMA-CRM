import { ADMIN_ROLES } from "@/lib/bk/staff";
import { getSettings } from "@/lib/bk/settings";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { SettingsView, type EnvStatus } from "@/components/admin/settings/settings-view";

export const dynamic = "force-dynamic";

function configured(name: string): boolean {
  const v = process.env[name];
  return Boolean(v) && !v!.includes("YOUR_");
}

export default async function SettingsPage() {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Settings" />;

  // Presence only — secrets are never rendered.
  const env: EnvStatus = {
    whatsapp: configured("WHATSAPP_ACCESS_TOKEN") && configured("WHATSAPP_PHONE_NUMBER_ID"),
    whatsappWebhook: configured("WHATSAPP_VERIFY_TOKEN") && configured("WHATSAPP_APP_SECRET"),
    resend: configured("RESEND_API_KEY"),
    emailFrom: configured("EMAIL_FROM"),
    serviceRole: configured("SUPABASE_SERVICE_ROLE_KEY"),
    cronSecret: configured("CRON_SECRET"),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  };

  try {
    const settings = await getSettings();
    return (
      <SettingsView
        env={env}
        taxes={settings.taxes}
        times={settings.times}
        cancellation={settings.cancellation}
        contact={settings.contact}
        reviews={settings.reviews}
        booking={settings.booking}
        messaging={{
          pre_arrival_days_before: settings.messaging.pre_arrival_days_before,
          pre_arrival_time: settings.messaging.pre_arrival_time,
          post_stay_days_after: settings.messaging.post_stay_days_after,
          post_stay_time: settings.messaging.post_stay_time,
        }}
        promo={settings.promo}
        cronDispatchUrl={settings.cron.dispatch_url}
        cronSecretSet={Boolean(settings.cron.secret)}
      />
    );
  } catch (e) {
    return <LoadError title="Settings" message={loadErrorMessage(e)} />;
  }
}
