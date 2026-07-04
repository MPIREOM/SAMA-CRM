"use client";

import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ExternalLink,
  Megaphone,
  MessageCircle,
  MonitorSmartphone,
  PlaneLanding,
  PlaneTakeoff,
  Upload,
  UserCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, marketLabel, type Strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge, marketVariant } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export interface DashboardStats {
  totalContacts: number;
  optedIn: number;
  oman: number;
  gcc: number;
  international: number;
  upcomingBookings: number;
  arrivalsToday: number;
  departuresToday: number;
  messages7d: number;
  enabledAutomations: number;
}

const STR = {
  welcome: { en: "Welcome back", ar: "مرحباً بعودتك" },
  subtitle: {
    en: "Sama Hotel at a glance — guests, stays and conversations",
    ar: "نظرة سريعة على فندق سما — الضيوف والإقامات والمحادثات",
  },
  totalContacts: { en: "Total contacts", ar: "إجمالي جهات الاتصال" },
  optedIn: { en: "Opted-in guests", ar: "ضيوف موافقون على التسويق" },
  upcoming: { en: "Upcoming bookings", ar: "الحجوزات القادمة" },
  arrivals: { en: "Arrivals today", ar: "وصول اليوم" },
  departures: { en: "Departures today", ar: "مغادرة اليوم" },
  messages7d: { en: "Messages (7 days)", ar: "الرسائل (٧ أيام)" },
  automationsOn: { en: "Active automations", ar: "الأتمتة المفعّلة" },
  byMarket: { en: "Guests by market", ar: "الضيوف حسب السوق" },
  quickActions: { en: "Quick actions", ar: "إجراءات سريعة" },
  newBooking: { en: "New booking", ar: "حجز جديد" },
  importContacts: { en: "Import contacts", ar: "استيراد جهات الاتصال" },
  newCampaign: { en: "New campaign", ar: "حملة جديدة" },
  openKiosk: { en: "Open kiosk", ar: "فتح شاشة تسجيل الوصول" },
} satisfies Strings;

type Tint = "maroon" | "gold" | "jabal" | "crimson";

const TINTS: Record<Tint, string> = {
  maroon: "bg-maroon-100 text-maroon-800",
  gold: "bg-gold-100 text-gold-700",
  jabal: "bg-jabal-50 text-jabal-600",
  crimson: "bg-crimson-50 text-crimson-700",
};

function StatCard({
  label,
  value,
  icon: Icon,
  tint,
  locale,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tint: Tint;
  locale: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            TINTS[tint]
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-maroon-400">
            {label}
          </p>
          <p className="text-3xl font-extrabold leading-tight text-maroon-900">
            {value.toLocaleString(locale)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionLink({
  href,
  icon: Icon,
  label,
  primary,
  newTab,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  primary?: boolean;
  newTab?: boolean;
}) {
  return (
    <Link
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        primary
          ? "bg-maroon-800 text-gold-100 hover:bg-maroon-700 focus-visible:ring-maroon-400"
          : "border border-maroon-200 bg-white text-maroon-800 hover:bg-maroon-50 focus-visible:ring-maroon-300"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {newTab && <ExternalLink className="h-3.5 w-3.5 opacity-60" />}
    </Link>
  );
}

export function DashboardView({
  stats,
  name,
}: {
  stats: DashboardStats;
  name: string | null;
}) {
  const { lang } = useLang();
  const locale = lang === "ar" ? "ar-OM" : "en-GB";

  const cards: {
    key: string;
    label: string;
    value: number;
    icon: LucideIcon;
    tint: Tint;
  }[] = [
    {
      key: "contacts",
      label: STR.totalContacts[lang],
      value: stats.totalContacts,
      icon: Users,
      tint: "maroon",
    },
    {
      key: "optedIn",
      label: STR.optedIn[lang],
      value: stats.optedIn,
      icon: UserCheck,
      tint: "jabal",
    },
    {
      key: "upcoming",
      label: STR.upcoming[lang],
      value: stats.upcomingBookings,
      icon: CalendarDays,
      tint: "gold",
    },
    {
      key: "arrivals",
      label: STR.arrivals[lang],
      value: stats.arrivalsToday,
      icon: PlaneLanding,
      tint: "maroon",
    },
    {
      key: "departures",
      label: STR.departures[lang],
      value: stats.departuresToday,
      icon: PlaneTakeoff,
      tint: "crimson",
    },
    {
      key: "messages",
      label: STR.messages7d[lang],
      value: stats.messages7d,
      icon: MessageCircle,
      tint: "jabal",
    },
    {
      key: "automations",
      label: STR.automationsOn[lang],
      value: stats.enabledAutomations,
      icon: Zap,
      tint: "crimson",
    },
  ];

  const markets: { market: "Oman" | "GCC" | "International"; value: number }[] =
    [
      { market: "Oman", value: stats.oman },
      { market: "GCC", value: stats.gcc },
      { market: "International", value: stats.international },
    ];

  return (
    <div>
      <PageHeader
        title={
          name ? `${STR.welcome[lang]}, ${name}` : `${STR.welcome[lang]}!`
        }
        subtitle={STR.subtitle[lang]}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <StatCard
            key={c.key}
            label={c.label}
            value={c.value}
            icon={c.icon}
            tint={c.tint}
            locale={locale}
          />
        ))}
      </div>

      {/* Market split */}
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-maroon-500">
        {STR.byMarket[lang]}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {markets.map((m) => (
          <Card key={m.market}>
            <CardContent className="flex items-end justify-between py-4">
              <div>
                <Badge variant={marketVariant(m.market)}>
                  {marketLabel(m.market, lang)}
                </Badge>
                <p className="mt-2 text-2xl font-extrabold leading-none text-maroon-900">
                  {m.value.toLocaleString(locale)}
                </p>
              </div>
              <p className="text-xs font-semibold text-maroon-300">
                {COMMON.contacts[lang]}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-maroon-500">
        {STR.quickActions[lang]}
      </h2>
      <div className="flex flex-wrap gap-3">
        <ActionLink
          href="/bookings/new"
          icon={CalendarPlus}
          label={STR.newBooking[lang]}
          primary
        />
        <ActionLink
          href="/contacts/import"
          icon={Upload}
          label={STR.importContacts[lang]}
        />
        <ActionLink
          href="/campaigns/new"
          icon={Megaphone}
          label={STR.newCampaign[lang]}
        />
        <ActionLink
          href="/checkin"
          icon={MonitorSmartphone}
          label={STR.openKiosk[lang]}
          newTab
        />
      </div>
    </div>
  );
}
