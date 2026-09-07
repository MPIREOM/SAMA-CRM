"use client";

import Link from "next/link";
import { AlertTriangle, BedDouble, CalendarDays, MailWarning, PlaneLanding, PlaneTakeoff, Plus, type LucideIcon } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { errorText, fmtDate, fmtDateShort, fmtMoney, localName, sourceLabel, statusLabel, statusVariant } from "../shared";
import { isWeekend } from "../calendar/layout";

interface Movement {
  id: string;
  ref: string;
  guest_name: string;
  guest_phone: string;
  status: string;
  room_type: { name_en: string; name_ar: string } | null;
  room: { room_number: string } | null;
}

export interface PropertyData {
  today: string;
  activeRooms: number;
  inHouse: number;
  occupancy: { today: number; next7: number; next30: number };
  chart: { date: string; occupied: number }[];
  pendingMessages: number;
  failedMessages: number;
  arrivals: Movement[];
  departures: Movement[];
  recent: {
    id: string;
    ref: string;
    guest_name: string;
    check_in: string;
    check_out: string;
    status: string;
    source: string;
    total_omr: number;
    created_at: string;
    room_type: { name_en: string; name_ar: string } | null;
  }[];
}

const STR = {
  welcome: { en: "Welcome back", ar: "مرحباً بعودتك" },
  subtitle: { en: "Sama Hotel today — arrivals, departures, occupancy and the message queue", ar: "فندق سما اليوم — الوصول والمغادرة والإشغال وقائمة الرسائل" },
  arrivals: { en: "Arrivals today", ar: "الوصول اليوم" },
  departures: { en: "Departures today", ar: "المغادرة اليوم" },
  inHouse: { en: "In house", ar: "المقيمون" },
  occToday: { en: "Occupancy today", ar: "الإشغال اليوم" },
  occ7: { en: "Next 7 days", ar: "الأيام السبعة القادمة" },
  occ30: { en: "Next 30 days", ar: "الثلاثون يوماً القادمة" },
  messages: { en: "Message queue", ar: "قائمة الرسائل" },
  pending: { en: "pending", ar: "قيد الانتظار" },
  failed: { en: "failed", ar: "فشلت" },
  chart: { en: "Occupancy — next 14 nights", ar: "الإشغال — الليالي الـ 14 القادمة" },
  recent: { en: "Latest bookings", ar: "أحدث الحجوزات" },
  none: { en: "None", ar: "لا يوجد" },
  noneArrivals: { en: "No arrivals today", ar: "لا يوجد وصول اليوم" },
  noneDepartures: { en: "No departures today", ar: "لا توجد مغادرة اليوم" },
  noRecent: { en: "No bookings yet", ar: "لا توجد حجوزات بعد" },
  rooms: { en: "rooms", ar: "غرفة" },
  openCalendar: { en: "Open calendar", ar: "فتح التقويم" },
  newBooking: { en: "New booking", ar: "حجز جديد" },
  unavailable: { en: "Property data unavailable", ar: "بيانات الفندق غير متاحة" },
  viewAll: { en: "View all", ar: "عرض الكل" },
} satisfies Strings;

function Stat({ label, value, icon: Icon, tint, href, sub }: { label: string; value: string; icon: LucideIcon; tint: string; href?: string; sub?: string }) {
  const body = (
    <CardContent className="flex items-center gap-3 py-4">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tint)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-maroon-400">{label}</p>
        <p className="text-2xl font-extrabold leading-tight text-maroon-900">{value}</p>
        {sub && <p className="text-[11px] text-maroon-400">{sub}</p>}
      </div>
    </CardContent>
  );
  return href ? (
    <Link href={href} className="block">
      <Card className="transition-colors hover:border-gold-400">{body}</Card>
    </Link>
  ) : (
    <Card>{body}</Card>
  );
}

function MovementList({ items, empty }: { items: Movement[]; empty: string }) {
  const { lang } = useLang();
  if (items.length === 0) return <p className="px-5 py-6 text-center text-sm text-maroon-400">{empty}</p>;
  return (
    <ul className="divide-y divide-maroon-100">
      {items.map((b) => (
        <li key={b.id}>
          <Link href={`/reservations/${b.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-maroon-50/60">
            <span className="w-14 shrink-0 rounded-md bg-maroon-100 px-2 py-1 text-center text-xs font-bold text-maroon-800">
              {b.room?.room_number ?? "—"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-maroon-900">{b.guest_name}</span>
              <span className="block truncate text-xs text-maroon-400">
                {b.ref} · {localName(b.room_type, lang)}
              </span>
            </span>
            <Badge variant={statusVariant(b.status)}>{statusLabel(b.status, lang)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PropertyOverview({ name, data, error }: { name: string | null; data: PropertyData | null; error: string | null }) {
  const { lang } = useLang();
  const locale = lang === "ar" ? "ar-OM" : "en-GB";

  return (
    <div>
      <PageHeader
        title={name ? `${STR.welcome[lang]}, ${name}` : `${STR.welcome[lang]}!`}
        subtitle={`${STR.subtitle[lang]}${data ? ` · ${fmtDate(data.today, lang)}` : ""}`}
        actions={
          <>
            <Link href="/calendar" className="inline-flex h-10 items-center gap-2 rounded-lg border border-maroon-200 bg-white px-4 text-sm font-semibold text-maroon-800 hover:bg-maroon-50">
              <CalendarDays className="h-4 w-4" />
              {STR.openCalendar[lang]}
            </Link>
            <Link href="/reservations/new">
              <Button>
                <Plus className="h-4 w-4" />
                {STR.newBooking[lang]}
              </Button>
            </Link>
          </>
        }
      />

      {!data ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-maroon-600">
            <AlertTriangle className="h-5 w-5 text-crimson-700" />
            <span>
              {STR.unavailable[lang]}: {errorText(error, lang)}
            </span>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label={STR.arrivals[lang]} value={String(data.arrivals.length)} icon={PlaneLanding} tint="bg-maroon-100 text-maroon-800" href="/reservations?status=confirmed,pending" />
            <Stat label={STR.departures[lang]} value={String(data.departures.length)} icon={PlaneTakeoff} tint="bg-crimson-50 text-crimson-700" href="/reservations?status=checked_in" />
            <Stat label={STR.inHouse[lang]} value={String(data.inHouse)} icon={BedDouble} tint="bg-jabal-50 text-jabal-600" sub={`${data.activeRooms} ${STR.rooms[lang]}`} href="/reservations?status=checked_in" />
            <Stat label={STR.occToday[lang]} value={`${data.occupancy.today}%`} icon={CalendarDays} tint="bg-gold-100 text-gold-700" href="/calendar" />
            <Stat label={STR.occ7[lang]} value={`${data.occupancy.next7}%`} icon={CalendarDays} tint="bg-gold-100 text-gold-700" sub={`${STR.occ30[lang]}: ${data.occupancy.next30}%`} href="/calendar" />
            <Stat
              label={STR.messages[lang]}
              value={`${data.pendingMessages}`}
              icon={data.failedMessages > 0 ? AlertTriangle : MailWarning}
              tint={data.failedMessages > 0 ? "bg-crimson-50 text-crimson-700" : "bg-maroon-100 text-maroon-800"}
              sub={`${data.pendingMessages} ${STR.pending[lang]} · ${data.failedMessages} ${STR.failed[lang]}`}
              href="/messaging"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="overflow-hidden">
              <CardHeader className="flex items-center justify-between">
                <CardTitle>{STR.arrivals[lang]}</CardTitle>
                <span className="text-xs font-semibold text-maroon-400">{data.arrivals.length}</span>
              </CardHeader>
              <MovementList items={data.arrivals} empty={STR.noneArrivals[lang]} />
            </Card>
            <Card className="overflow-hidden">
              <CardHeader className="flex items-center justify-between">
                <CardTitle>{STR.departures[lang]}</CardTitle>
                <span className="text-xs font-semibold text-maroon-400">{data.departures.length}</span>
              </CardHeader>
              <MovementList items={data.departures} empty={STR.noneDepartures[lang]} />
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{STR.chart[lang]}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Pure-CSS bar chart: height = occupied ÷ active rooms */}
                <div className="flex h-36 items-end gap-1" role="img" aria-label={STR.chart[lang]}>
                  {data.chart.map((d) => {
                    const pct = data.activeRooms === 0 ? 0 : Math.round((d.occupied / data.activeRooms) * 100);
                    return (
                      <div key={d.date} className="group flex flex-1 flex-col items-center justify-end gap-1" title={`${fmtDateShort(d.date, lang)} · ${d.occupied}/${data.activeRooms} (${pct}%)`}>
                        <span className="text-[9px] font-semibold text-maroon-400 opacity-0 transition-opacity group-hover:opacity-100">{pct}%</span>
                        <div
                          className={cn("w-full rounded-t-sm transition-colors", d.date === data.today ? "bg-gold-500" : isWeekend(d.date) ? "bg-maroon-600" : "bg-maroon-800", "group-hover:bg-gold-400")}
                          style={{ height: `${Math.max(3, pct)}%` }}
                        />
                        <span className={cn("text-[9px]", d.date === data.today ? "font-bold text-maroon-900" : "text-maroon-400")}>{parseInt(d.date.slice(8), 10)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6 overflow-hidden">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>{STR.recent[lang]}</CardTitle>
              <Link href="/reservations" className="text-xs font-semibold text-maroon-500 hover:underline">
                {STR.viewAll[lang]} →
              </Link>
            </CardHeader>
            {data.recent.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-maroon-400">{STR.noRecent[lang]}</p>
            ) : (
              <ul className="divide-y divide-maroon-100">
                {data.recent.map((b) => (
                  <li key={b.id}>
                    <Link href={`/reservations/${b.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 hover:bg-maroon-50/60">
                      <span className="w-32 shrink-0 text-sm font-bold text-maroon-900">{b.ref}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-maroon-800">
                        {b.guest_name} <span className="text-maroon-400">· {localName(b.room_type, lang)}</span>
                      </span>
                      <span className="text-xs text-maroon-500">
                        {fmtDate(b.check_in, lang)} → {fmtDate(b.check_out, lang)}
                      </span>
                      <Badge variant="outline">{sourceLabel(b.source, lang)}</Badge>
                      <Badge variant={statusVariant(b.status)}>{statusLabel(b.status, lang)}</Badge>
                      <span className="w-24 text-end text-sm font-semibold text-maroon-900">{fmtMoney(b.total_omr, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="mt-2 text-[11px] text-maroon-300">
            {COMMON.today[lang]}: {new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "Asia/Muscat" }).format(new Date())} ({COMMON.muscatTime[lang]})
          </p>
        </>
      )}
    </div>
  );
}
