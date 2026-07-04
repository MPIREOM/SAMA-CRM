"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  Languages,
  LogOut,
  Megaphone,
  MessageCircle,
  MonitorSmartphone,
  Users,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Localized } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/database.types";

interface NavItem {
  href: string;
  label: Localized;
  icon: typeof Users;
  roles: Role[];
}

// reservation_desk sees ONLY bookings, inbox, contacts.
const NAV: NavItem[] = [
  { href: "/dashboard", label: COMMON.dashboard, icon: LayoutDashboard, roles: ["super_admin"] },
  { href: "/bookings", label: COMMON.bookings, icon: CalendarDays, roles: ["super_admin", "reservation_desk"] },
  { href: "/inbox", label: COMMON.inbox, icon: MessageCircle, roles: ["super_admin", "reservation_desk"] },
  { href: "/contacts", label: COMMON.contacts, icon: Users, roles: ["super_admin", "reservation_desk"] },
  { href: "/automations", label: COMMON.automations, icon: Zap, roles: ["super_admin"] },
  { href: "/campaigns", label: COMMON.campaigns, icon: Megaphone, roles: ["super_admin"] },
];

export function Sidebar({
  role,
  fullName,
}: {
  role: Role;
  fullName: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, toggle } = useLang();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const items = NAV.filter((item) => item.roles.includes(role));

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-maroon-800 text-gold-100">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500 text-lg font-extrabold text-maroon-900">
          S
        </div>
        <div>
          <p className="text-lg font-extrabold leading-tight text-gold-400">
            {COMMON.appName[lang]}
          </p>
          <p className="text-[11px] text-maroon-300">{COMMON.hotelName[lang]}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-thin px-3">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-gold-500 text-maroon-900"
                  : "text-maroon-100 hover:bg-maroon-700 hover:text-gold-200"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label[lang]}
            </Link>
          );
        })}

        {/* Kiosk launcher — opens the locked guest check-in screen */}
        <a
          href="/checkin"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-maroon-100 transition-colors hover:bg-maroon-700 hover:text-gold-200"
        >
          <MonitorSmartphone className="h-5 w-5" />
          {COMMON.kiosk[lang]}
        </a>
      </nav>

      {/* Footer */}
      <div className="border-t border-maroon-700 p-3">
        <div className="mb-2 px-2">
          <p className="truncate text-sm font-bold text-gold-200">
            {fullName ?? "—"}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-maroon-300">
            {role === "super_admin"
              ? lang === "ar" ? "مدير النظام" : "Super admin"
              : lang === "ar" ? "مكتب الحجوزات" : "Reservation desk"}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={toggle}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-maroon-100 hover:bg-maroon-700"
          >
            <Languages className="h-4 w-4" />
            {lang === "en" ? "العربية" : "English"}
          </button>
          <button
            onClick={signOut}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-maroon-100 hover:bg-maroon-700"
          >
            <LogOut className="h-4 w-4" />
            {COMMON.signOut[lang]}
          </button>
        </div>
      </div>
    </aside>
  );
}
