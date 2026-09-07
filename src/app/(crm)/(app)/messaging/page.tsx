import { createAdminClient } from "@/lib/supabase/admin";
import { FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { getSettings } from "@/lib/bk/settings";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { MessagingView, type PreviewMap, type QueueRow } from "@/components/admin/messaging/messaging-view";
import { renderPreviewSafe, type PreviewChannel, type PreviewKind, type PreviewLocale } from "@/components/admin/messaging/preview-adapter";

export const dynamic = "force-dynamic";

const KINDS: PreviewKind[] = ["confirmation", "pre_arrival", "post_stay"];
const CHANNELS: PreviewChannel[] = ["email", "whatsapp"];
const LOCALES: PreviewLocale[] = ["en", "ar"];

export default async function MessagingPage() {
  const session = await guardPage(FRONT_DESK_ROLES);
  if (!session) return <NoAccess title="Messaging" />;

  try {
    const admin = createAdminClient();
    const [queue, log, settings] = await Promise.all([
      admin
        .from("bk_scheduled_messages")
        .select("*, booking:bk_bookings(ref, guest_name, guest_phone, guest_email, preferred_lang)")
        .order("send_at", { ascending: false })
        .limit(300),
      admin.from("bk_message_log").select("*").order("created_at", { ascending: false }).limit(200),
      getSettings(),
    ]);
    if (queue.error) throw new Error(queue.error.message);
    if (log.error) throw new Error(log.error.message);

    // Template previews (sample data) — server-rendered so the page needs no extra round-trips.
    const previews: PreviewMap = {};
    await Promise.all(
      KINDS.flatMap((kind) =>
        CHANNELS.flatMap((channel) =>
          LOCALES.map(async (locale) => {
            previews[`${kind}:${channel}:${locale}`] = await renderPreviewSafe(kind, channel, locale);
          })
        )
      )
    );

    const rows: QueueRow[] = (queue.data ?? []).map((m) => {
      const booking = Array.isArray(m.booking) ? (m.booking[0] ?? null) : m.booking;
      return { ...m, booking };
    });

    return (
      <MessagingView
        role={session.role}
        queue={rows}
        log={log.data ?? []}
        emailEnabled={settings.messaging.email_enabled}
        whatsappEnabled={settings.messaging.whatsapp_enabled}
        testPhone={settings.messaging.test_phone}
        testEmail={settings.messaging.test_email}
        previews={previews}
      />
    );
  } catch (e) {
    return <LoadError title="Messaging" message={loadErrorMessage(e)} />;
  }
}
