"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Ban,
  BedDouble,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Languages,
  LogOut,
  Megaphone,
  MessageCircle,
  MonitorSmartphone,
  ScrollText,
  Send,
  Settings,
  Tag,
  UserCog,
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

interface NavSection {
  label: Localized | null;
  items: NavItem[];
}

const BOTH: Role[] = ["super_admin", "reservation_desk"];
const ADMIN: Role[] = ["super_admin"];

// reservation_desk: dashboard, calendar, reservations, blocks, messaging + inbox, contacts.
// super_admin: everything.
const SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: COMMON.dashboard, icon: LayoutDashboard, roles: BOTH }],
  },
  {
    label: COMMON.property,
    items: [
      { href: "/calendar", label: COMMON.calendar, icon: CalendarDays, roles: BOTH },
      { href: "/reservations", label: COMMON.reservations, icon: ClipboardList, roles: BOTH },
      { href: "/blocks", label: COMMON.blocks, icon: Ban, roles: BOTH },
      { href: "/messaging", label: COMMON.messaging, icon: Send, roles: BOTH },
      { href: "/rooms", label: COMMON.rooms, icon: BedDouble, roles: ADMIN },
      { href: "/rates", label: COMMON.rates, icon: Tag, roles: ADMIN },
      { href: "/settings", label: COMMON.settings, icon: Settings, roles: ADMIN },
      { href: "/audit", label: COMMON.audit, icon: ScrollText, roles: ADMIN },
    ],
  },
  {
    label: COMMON.crm,
    items: [
      { href: "/inbox", label: COMMON.inbox, icon: MessageCircle, roles: BOTH },
      { href: "/contacts", label: COMMON.contacts, icon: Users, roles: BOTH },
      { href: "/automations", label: COMMON.automations, icon: Zap, roles: ADMIN },
      { href: "/campaigns", label: COMMON.campaigns, icon: Megaphone, roles: ADMIN },
      { href: "/users", label: COMMON.staff, icon: UserCog, roles: ADMIN },
    ],
  },
];

export function Sidebar({
  role,
  fullName,
  onNavigate,
}: {
  role: Role;
  fullName: string | null;
  /** Called after a nav link is clicked (closes the mobile drawer). */
  onNavigate?: () => void;
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

  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((item) => item.roles.includes(role)) })).filter(
    (s) => s.items.length > 0
  );

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-maroon-800 text-gold-100 lg:h-screen">
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
      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-thin px-3 pb-3">
        {sections.map((section, i) => (
          <div key={section.label?.en ?? i} className={cn(i > 0 && "pt-3")}>
            {section.label && (
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-maroon-300">
                {section.label[lang]}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
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
            </div>
          </div>
        ))}

        {/* Kiosk launcher — opens the locked guest check-in screen */}
        <a
          href="/checkin"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-maroon-100 transition-colors hover:bg-maroon-700 hover:text-gold-200"
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
