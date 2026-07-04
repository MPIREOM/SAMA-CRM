import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { getSessionProfile } from "@/lib/auth";
import type { Role } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const role: Role = (session.role ?? "reservation_desk") as Role;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} fullName={session.profile?.full_name ?? session.email} />
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-6xl p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
