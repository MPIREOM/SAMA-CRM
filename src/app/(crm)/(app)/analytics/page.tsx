import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "@/lib/bk/staff";
import { muscatToday } from "@/lib/booking-engine/dates";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { AnalyticsView } from "@/components/admin/analytics/analytics-view";
import { loadBookingsMade, loadCatalog, loadStays, loadWebEvents, resolveRange } from "@/lib/analytics/load";
import { bookingFunnel, patternStats, revenueStats, trafficStats } from "@/lib/analytics/stats";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: { range?: string; from?: string; to?: string } }) {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Analytics" />;

  try {
    const { preset, from, to } = resolveRange(searchParams, muscatToday());
    const admin = createAdminClient();
    const [events, stays, made, catalog] = await Promise.all([loadWebEvents(admin, from, to), loadStays(admin, from, to), loadBookingsMade(admin, from, to), loadCatalog(admin)]);
    return (
      <AnalyticsView
        preset={preset}
        from={from}
        to={to}
        traffic={trafficStats(events, from, to)}
        funnel={bookingFunnel(events)}
        revenue={revenueStats(stays, catalog.roomsByType, from, to)}
        patterns={patternStats(made.bookings, made.addons)}
        types={catalog.types}
        addons={catalog.addons}
      />
    );
  } catch (e) {
    return <LoadError title="Analytics" message={loadErrorMessage(e)} />;
  }
}
