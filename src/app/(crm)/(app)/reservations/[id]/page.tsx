import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { getBookingById, getBookingMessages, type BookingWithRelations } from "@/lib/bk/bookings";
import { muscatToday } from "@/lib/booking-engine/dates";
import type { BkAuditLog, BkMessageLog, BkScheduledMessage } from "@/lib/database.types";
import type { AddonOption } from "@/components/admin/reservations/booking-addons";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { BookingDetail } from "@/components/admin/reservations/booking-detail";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Loaded = {
  booking: BookingWithRelations | null;
  scheduled: BkScheduledMessage[];
  log: BkMessageLog[];
  auditRows: Pick<BkAuditLog, "id" | "action" | "actor_email" | "created_at" | "diff">[];
  /** Active add-ons staff can add to the booking. */
  catalogue: AddonOption[];
};

const CATALOGUE_SELECT = "id, slug, kind, name_en, name_ar, price_omr, unit, max_quantity, taxable, requires_note, note_hint_en, note_hint_ar";

export default async function ReservationDetailPage({ params }: { params: { id: string } }) {
  const session = await guardPage(FRONT_DESK_ROLES);
  if (!session) return <NoAccess title="Reservation" />;
  if (!UUID.test(params.id)) notFound();

  let loaded: Loaded;
  try {
    const booking = await getBookingById(params.id);
    if (!booking) {
      loaded = { booking: null, scheduled: [], log: [], auditRows: [], catalogue: [] };
    } else {
      const admin = createAdminClient();
      const [messages, auditRows, profiles, catalogue] = await Promise.all([
        getBookingMessages(booking.id),
        admin
          .from("bk_audit_log")
          .select("id, action, actor_email, actor_user_id, created_at, diff")
          .eq("entity", "bk_bookings")
          .eq("entity_id", booking.id)
          .order("created_at", { ascending: false })
          .limit(20),
        admin.from("profiles").select("id, full_name"),
        admin.from("bk_addons").select(CATALOGUE_SELECT).eq("is_active", true).order("sort_order"),
      ]);
      // bk_cancel_booking writes its audit row with actor_user_id only — show the staff name instead of "—".
      const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
      loaded = {
        booking,
        scheduled: messages.scheduled,
        log: messages.log,
        auditRows: (auditRows.data ?? []).map((a) => ({
          ...a,
          actor_email: a.actor_email ?? (a.actor_user_id ? (names.get(a.actor_user_id) ?? null) : null),
        })),
        catalogue: (catalogue.data ?? []).map((a) => ({ ...a, price_omr: Number(a.price_omr) })),
      };
    }
  } catch (e) {
    return <LoadError title="Reservation" message={loadErrorMessage(e)} />;
  }

  const { booking } = loaded;
  if (!booking) notFound();

  return (
    <BookingDetail
      booking={{
        ...booking,
        room_subtotal_omr: Number(booking.room_subtotal_omr),
        discount_omr: Number(booking.discount_omr),
        service_charge_omr: Number(booking.service_charge_omr),
        tourism_fee_omr: Number(booking.tourism_fee_omr),
        vat_omr: Number(booking.vat_omr),
        total_omr: Number(booking.total_omr),
        addons_omr: Number(booking.addons_omr),
        addons: (booking.addons ?? []).map((l) => ({
          ...l,
          unit_price_omr: Number(l.unit_price_omr),
          total_omr: Number(l.total_omr),
          addon: l.addon ? { ...l.addon, price_omr: Number(l.addon.price_omr) } : null,
        })),
      }}
      catalogue={loaded.catalogue}
      scheduled={loaded.scheduled}
      log={loaded.log}
      auditRows={loaded.auditRows}
      today={muscatToday()}
      role={session.role}
    />
  );
}
