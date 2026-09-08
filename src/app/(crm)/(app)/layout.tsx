import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
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
    <AppShell role={role} fullName={session.profile?.full_name ?? session.email}>
      {children}
    </AppShell>
  );
}
