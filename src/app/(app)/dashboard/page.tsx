import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import {
  DashboardView,
  type DashboardStats,
} from "@/components/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

// super_admin landing page. reservation_desk lands on /bookings instead.
export default async function DashboardPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.role !== "super_admin") redirect("/bookings");

  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

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
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("consent", true),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("market", "Oman"),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("market", "GCC"),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("market", "International"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .gte("check_in", today)
      .or("status.is.null,status.neq.Cancelled"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("check_in", today)
      .or("status.is.null,status.neq.Cancelled"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("check_out", today)
      .or("status.is.null,status.neq.Cancelled"),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .gte("sent_at", sevenDaysAgo),
    supabase
      .from("automations")
      .select("*", { count: "exact", head: true })
      .eq("enabled", true),
  ]);

  const stats: DashboardStats = {
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

  return (
    <DashboardView
      stats={stats}
      name={session.profile?.full_name ?? session.email}
    />
  );
}
