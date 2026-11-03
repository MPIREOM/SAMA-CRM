"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import type { Strings } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { BOOKING_SOURCES, sourceLabel } from "../shared";

const STR = {
  title: { en: "Reports", ar: "التقارير" },
  subtitle: { en: "Download reservations, revenue, guests and add-ons as CSV or Excel. Every download is recorded in the audit log.", ar: "نزّل الحجوزات والإيرادات والضيوف والإضافات بصيغة CSV أو Excel. يُسجَّل كل تنزيل في سجل التدقيق." },
  analytics: { en: "Open analytics", ar: "فتح التحليلات" },
  from: { en: "From", ar: "من" },
  to: { en: "To", ar: "إلى" },
  csv: { en: "CSV", ar: "CSV" },
  xlsx: { en: "Excel", ar: "Excel" },
  resTitle: { en: "Reservations", ar: "الحجوزات" },
  resDesc: { en: "Every booking with guest, room, dates, add-ons, prices and taxes.", ar: "كل حجز مع الضيف والغرفة والتواريخ والإضافات والأسعار والضرائب." },
  basis: { en: "Dates apply to", ar: "التواريخ تنطبق على" },
  bCheckIn: { en: "Check-in date", ar: "تاريخ الوصول" },
  bCreated: { en: "Booking date", ar: "تاريخ الحجز" },
  bStay: { en: "Any night stayed", ar: "أي ليلة إقامة" },
  status: { en: "Status", ar: "الحالة" },
  sAll: { en: "All", ar: "الكل" },
  sLive: { en: "Active (not cancelled)", ar: "نشطة (غير ملغاة)" },
  sCancelled: { en: "Cancelled & no-show", ar: "ملغاة ولم يحضر" },
  source: { en: "Channel", ar: "القناة" },
  category: { en: "Room category", ar: "فئة الغرفة" },
  any: { en: "Any", ar: "الكل" },
  revTitle: { en: "Revenue & occupancy", ar: "الإيرادات والإشغال" },
  revDesc: { en: "Per night, per month and per room category: rooms sold, occupancy, room revenue, ADR, RevPAR, plus service charge, tourism fee and VAT. Excel has every sheet; CSV has the daily sheet.", ar: "لكل ليلة وشهر وفئة: الغرف المباعة، الإشغال، إيراد الغرف، متوسط السعر، الإيراد لكل غرفة، مع رسوم الخدمة والسياحة والضريبة. ملف Excel يحتوي كل الأوراق؛ CSV يحتوي الورقة اليومية." },
  guestTitle: { en: "Guests", ar: "الضيوف" },
  guestDesc: { en: "One row per guest who stayed in the period: contact details, stays, nights and total spent.", ar: "صف لكل ضيف أقام في الفترة: بيانات التواصل، عدد الإقامات، الليالي وإجمالي الإنفاق." },
  addonTitle: { en: "Add-ons", ar: "الإضافات" },
  addonDesc: { en: "Zipline, 4WD transfers and other add-ons by check-in date, with totals per add-on.", ar: "الزيبلاين ونقل الدفع الرباعي والإضافات الأخرى حسب تاريخ الوصول، مع الإجمالي لكل إضافة." },
  dailyTitle: { en: "Arrivals, departures & in-house", ar: "الوصول والمغادرة والمقيمون" },
  dailyDesc: { en: "Printable front-desk lists for one day — also available to reservation desk staff.", ar: "قوائم مكتب الاستقبال القابلة للطباعة ليوم واحد — متاحة أيضاً لموظفي الحجوزات." },
  openLists: { en: "Open the lists", ar: "فتح القوائم" },
} satisfies Strings;

interface Props {
  today: string;
  monthStart: string;
  types: { id: string; name_en: string; name_ar: string }[];
}

function ReportCard({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col p-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-maroon-900">
        <FileSpreadsheet className="h-4 w-4 text-maroon-500" />
        {title}
      </h2>
      <p className="mb-4 mt-1 text-xs text-maroon-500">{desc}</p>
      {children}
    </Card>
  );
}

export function ReportsView({ today, monthStart, types }: Props) {
  const { lang } = useLang();

  const Dates = ({ id }: { id: string }) => (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label htmlFor={`${id}-from`}>{STR.from[lang]}</Label>
        <Input id={`${id}-from`} type="date" name="from" defaultValue={monthStart} required />
      </div>
      <div>
        <Label htmlFor={`${id}-to`}>{STR.to[lang]}</Label>
        <Input id={`${id}-to`} type="date" name="to" defaultValue={today} required />
      </div>
    </div>
  );

  const Buttons = () => (
    <div className="mt-auto flex gap-2 pt-4">
      <button type="submit" name="format" value="xlsx" className="inline-flex items-center gap-1.5 rounded-lg bg-maroon-800 px-3 py-2 text-sm font-semibold text-white hover:bg-maroon-900">
        <Download className="h-4 w-4" />
        {STR.xlsx[lang]}
      </button>
      <button type="submit" name="format" value="csv" className="inline-flex items-center gap-1.5 rounded-lg border border-maroon-200 px-3 py-2 text-sm font-semibold text-maroon-800 hover:bg-maroon-50">
        <Download className="h-4 w-4" />
        {STR.csv[lang]}
      </button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={STR.title[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <Link href="/analytics" className="text-sm font-semibold text-maroon-700 underline-offset-2 hover:underline">
            {STR.analytics[lang]} →
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title={STR.resTitle[lang]} desc={STR.resDesc[lang]}>
          <form action="/reports/export" method="get" className="flex flex-1 flex-col space-y-3" data-testid="report-reservations">
            <input type="hidden" name="type" value="reservations" />
            <Dates id="res" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="res-basis">{STR.basis[lang]}</Label>
                <Select id="res-basis" name="basis" defaultValue="check_in">
                  <option value="check_in">{STR.bCheckIn[lang]}</option>
                  <option value="created">{STR.bCreated[lang]}</option>
                  <option value="stay">{STR.bStay[lang]}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="res-status">{STR.status[lang]}</Label>
                <Select id="res-status" name="status" defaultValue="all">
                  <option value="all">{STR.sAll[lang]}</option>
                  <option value="live">{STR.sLive[lang]}</option>
                  <option value="cancelled">{STR.sCancelled[lang]}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="res-source">{STR.source[lang]}</Label>
                <Select id="res-source" name="source" defaultValue="">
                  <option value="">{STR.any[lang]}</option>
                  {BOOKING_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {sourceLabel(s, lang)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="res-type">{STR.category[lang]}</Label>
                <Select id="res-type" name="room_type" defaultValue="">
                  <option value="">{STR.any[lang]}</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {lang === "ar" ? t.name_ar : t.name_en}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Buttons />
          </form>
        </ReportCard>

        <ReportCard title={STR.revTitle[lang]} desc={STR.revDesc[lang]}>
          <form action="/reports/export" method="get" className="flex flex-1 flex-col space-y-3" data-testid="report-revenue">
            <input type="hidden" name="type" value="revenue" />
            <Dates id="rev" />
            <Buttons />
          </form>
        </ReportCard>

        <ReportCard title={STR.guestTitle[lang]} desc={STR.guestDesc[lang]}>
          <form action="/reports/export" method="get" className="flex flex-1 flex-col space-y-3" data-testid="report-guests">
            <input type="hidden" name="type" value="guests" />
            <Dates id="gst" />
            <Buttons />
          </form>
        </ReportCard>

        <ReportCard title={STR.addonTitle[lang]} desc={STR.addonDesc[lang]}>
          <form action="/reports/export" method="get" className="flex flex-1 flex-col space-y-3" data-testid="report-addons">
            <input type="hidden" name="type" value="addons" />
            <Dates id="add" />
            <Buttons />
          </form>
        </ReportCard>

        <ReportCard title={STR.dailyTitle[lang]} desc={STR.dailyDesc[lang]}>
          <Link href="/daily-lists" className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg bg-maroon-800 px-3 py-2 text-sm font-semibold text-white hover:bg-maroon-900">
            {STR.openLists[lang]} →
          </Link>
        </ReportCard>
      </div>
    </div>
  );
}
