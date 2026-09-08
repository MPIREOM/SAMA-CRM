import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { muscatToday } from "@/lib/booking-engine/dates";
import { addDays } from "@/lib/booking-engine/pricing";
import { logger } from "@/lib/logger";
import {
  DashboardView,
  type DashboardStats,
} from "@/components/dashboard/dashboard-view";
import { PropertyOverview, type PropertyData } from "@/components/admin/dashboard/property-overview";

export const dynamic = "force-dynamic";

const LIVE = ["pending", "confirmed", "checked_in"];

/**
 * 4WD transfers booked on today's movements: booking id → transfer slugs
 * (`transfer-up` = pickup at the checkpoint, `transfer-down` = drop-off).
 * Joined through bk_booking_addons → bk_addons(kind = 'transfer'); cancelled
 * lines are ignored.
 */
async function transfersFor(admin: ReturnType<typeof createAdminClient>, bookingIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (bookingIds.length === 0) return out;
  const { data, error } = await admin
    .from("bk_booking_addons")
    .select("booking_id, status, addon:bk_addons(kind, slug)")
    .in("booking_id", bookingIds)
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
  for (const line of data ?? []) {
    const addon = Array.isArray(line.addon) ? (line.addon[0] ?? null) : line.addon;
    if (addon?.kind !== "transfer") continue;
    out.set(line.booking_id, [...(out.get(line.booking_id) ?? []), addon.slug]);
  }
  return out;
}

/** Property section: today's movements, occupancy, message queue — service role. */
async function loadProperty(today: string): Promise<PropertyData | { error: string }> {
  try {
    const admin = createAdminClient();
    const horizon = addDays(today, 30);
    const [arrivals, departures, inHouse, window, rooms, pendingMsgs, failedMsgs, recent] = await Promise.all([
      admin
        .from("bk_bookings")
        .select("id, ref, guest_name, guest_phone, status, room_type:bk_room_types(name_en, name_ar), room:bk_rooms(room_number)")
        .eq("check_in", today)
        .in("status", ["confirmed", "checked_in", "pending"])
        .order("guest_name")
        .limit(100),
      admin
        .from("bk_bookings")
        .select("id, ref, guest_name, guest_phone, status, room_type:bk_room_types(name_en, name_ar), room:bk_rooms(room_number)")
        .eq("check_out", today)
        .in("status", ["checked_in", "checked_out"])
        .order("guest_name")
        .limit(100),
      admin.from("bk_bookings").select("id", { count: "exact", head: true }).eq("status", "checked_in"),
      admin.from("bk_bookings").select("check_in, check_out").in("status", LIVE).lt("check_in", horizon).gt("check_out", today),
      admin.from("bk_rooms").select("id", { count: "exact", head: true }).eq("status", "active"),
      admin.from("bk_scheduled_messages").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("bk_scheduled_messages").select("id", { count: "exact", head: true }).eq("status", "failed"),
      admin
        .from("bk_bookings")
        .select("id, ref, guest_name, check_in, check_out, status, source, total_omr, created_at, room_type:bk_room_types(name_en, name_ar)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    const failed = [arrivals, departures, inHouse, window, rooms, pendingMsgs, failedMsgs, recent].find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    const transfers = await transfersFor(admin, [...(arrivals.data ?? []), ...(departures.data ?? [])].map((b) => b.id));
    // Arrivals need the pickup ("up"); departures the drop-off ("down"). Any other transfer kind counts for both.
    const pickup = (id: string) => (transfers.get(id) ?? []).some((slug) => slug !== "transfer-down");
    const dropoff = (id: string) => (transfers.get(id) ?? []).some((slug) => slug !== "transfer-up");

    // Occupied room-nights per day for the next 30 days.
    const activeRooms = rooms.count ?? 0;
    const occupied = new Array<number>(30).fill(0);
    for (const b of window.data ?? []) {
      for (let i = 0; i < 30; i++) {
        const d = addDays(today, i);
        if (b.check_in <= d && b.check_out > d) occupied[i] += 1;
      }
    }
    const pct = (days: number) => (activeRooms === 0 ? 0 : Math.round((occupied.slice(0, days).reduce((s, n) => s + n, 0) / (activeRooms * days)) * 100));

    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

    return {
      today,
      activeRooms,
      inHouse: inHouse.count ?? 0,
      occupancy: { today: pct(1), next7: pct(7), next30: pct(30) },
      chart: occupied.slice(0, 14).map((n, i) => ({ date: addDays(today, i), occupied: n })),
      pendingMessages: pendingMsgs.count ?? 0,
      failedMessages: failedMsgs.count ?? 0,
      arrivals: (arrivals.data ?? []).map((b) => ({ ...b, room_type: one(b.room_type), room: one(b.room), transfer: pickup(b.id) ? ("pickup" as const) : null })),
      departures: (departures.data ?? []).map((b) => ({ ...b, room_type: one(b.room_type), room: one(b.room), transfer: dropoff(b.id) ? ("dropoff" as const) : null })),
      recent: (recent.data ?? []).map((b) => ({ ...b, total_omr: Number(b.total_omr), room_type: one(b.room_type) })),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("dashboard.property", message);
    return { error: message.includes("SUPABASE_SERVICE_ROLE_KEY") ? "not_configured" : message };
  }
}

// Landing page for both roles: property overview on top, CRM stats (super_admin) below.
export default async function DashboardPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const isAdmin = session.role === "super_admin";
  const name = session.profile?.full_name ?? session.email;
  const today = muscatToday();

  const propertyPromise = loadProperty(today);

  let stats: DashboardStats | null = null;
  if (isAdmin) {
    const supabase = createClient();
    const localToday = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Count-only queries (head:true) via the user-scoped client — RLS applies.
    const [
      totalContacts,
      optedIn,
      oman,
      gcc,
      international,
      upcomingBookings,
      arrivalsToday,
      departuresToday,
      messages7d,
      enabledAutomations,
    ] = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("consent", true),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("market", "Oman"),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("market", "GCC"),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("market", "International"),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .gte("check_in", localToday)
        .or("status.is.null,status.neq.Cancelled"),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("check_in", localToday)
        .or("status.is.null,status.neq.Cancelled"),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("check_out", localToday)
        .or("status.is.null,status.neq.Cancelled"),
      supabase.from("messages").select("*", { count: "exact", head: true }).gte("sent_at", sevenDaysAgo),
      supabase.from("automations").select("*", { count: "exact", head: true }).eq("enabled", true),
    ]);

    stats = {
      totalContacts: totalContacts.count ?? 0,
      optedIn: optedIn.count ?? 0,
      oman: oman.count ?? 0,
      gcc: gcc.count ?? 0,
      international: international.count ?? 0,
      upcomingBookings: upcomingBookings.count ?? 0,
      arrivalsToday: arrivalsToday.count ?? 0,
      departuresToday: departuresToday.count ?? 0,
      messages7d: messages7d.count ?? 0,
      enabledAutomations: enabledAutomations.count ?? 0,
    };
  }

  const property = await propertyPromise;

  return (
    <div>
      <PropertyOverview name={name} data={"error" in property ? null : property} error={"error" in property ? property.error : null} />
      {stats && (
        // The CRM view carries its own welcome header; the property section above already greets the user.
        <div className="mt-10 border-t border-maroon-100 pt-8 [&>div>div:first-child]:hidden">
          <DashboardView stats={stats} name={name} />
        </div>
      )}
    </div>
  );
}
