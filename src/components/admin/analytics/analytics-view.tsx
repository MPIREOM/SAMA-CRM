"use client";

import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/components/providers/lang-provider";
import type { Lang, Strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatOmr } from "@/lib/booking-engine/pricing";
import type { FunnelStep, PatternStats, RevenueStats, TrafficStats } from "@/lib/analytics/stats";
import type { RangePreset } from "@/lib/analytics/load";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, sourceLabel } from "../shared";
import { BarList, ColumnChart, Panel, Section, StatGrid, StatTile, pct } from "./charts";

const STR = {
  title: { en: "Analytics", ar: "التحليلات" },
  subtitle: { en: "Website visitors, booking conversion, revenue and booking patterns", ar: "زوار الموقع، تحويل الحجوزات، الإيرادات وأنماط الحجز" },
  r7d: { en: "Last 7 days", ar: "آخر 7 أيام" },
  r30d: { en: "Last 30 days", ar: "آخر 30 يوماً" },
  r90d: { en: "Last 90 days", ar: "آخر 90 يوماً" },
  rmtd: { en: "This month", ar: "هذا الشهر" },
  rnext30: { en: "Next 30 days", ar: "الـ30 يوماً القادمة" },
  from: { en: "From", ar: "من" },
  to: { en: "To", ar: "إلى" },
  apply: { en: "Apply", ar: "تطبيق" },
  reports: { en: "Reports & exports", ar: "التقارير والتصدير" },
  // traffic
  traffic: { en: "Website traffic", ar: "زيارات الموقع" },
  trafficHint: { en: "Real visitors only (bots filtered). No cookies; a visitor is counted once per day.", ar: "الزوار الحقيقيون فقط (بدون الروبوتات). بدون ملفات تعريف الارتباط؛ يُحسب الزائر مرة واحدة يومياً." },
  visitors: { en: "Visitors", ar: "الزوار" },
  sessions: { en: "Visits", ar: "الزيارات" },
  pageviews: { en: "Page views", ar: "مشاهدات الصفحات" },
  pps: { en: "Pages per visit", ar: "صفحات لكل زيارة" },
  bounce: { en: "Bounce rate", ar: "معدل الارتداد" },
  bounceSub: { en: "visits with one page", ar: "زيارات بصفحة واحدة" },
  dailyVisitors: { en: "Visitors per day", ar: "الزوار يومياً" },
  sources: { en: "Where visitors came from", ar: "مصادر الزوار" },
  pages: { en: "Top pages", ar: "أكثر الصفحات زيارة" },
  countries: { en: "Countries", ar: "الدول" },
  devices: { en: "Devices", ar: "الأجهزة" },
  languages: { en: "Site language", ar: "لغة الموقع" },
  browsers: { en: "Browsers & apps", ar: "المتصفحات والتطبيقات" },
  noTraffic: { en: "No visits recorded in this period yet.", ar: "لا توجد زيارات مسجلة في هذه الفترة بعد." },
  // funnel
  funnel: { en: "Booking funnel", ar: "مسار الحجز" },
  funnelHint: { en: "Website visits that reached each step of booking.", ar: "زيارات الموقع التي وصلت إلى كل خطوة من خطوات الحجز." },
  fsessions: { en: "Visited the site", ar: "زار الموقع" },
  fresults: { en: "Searched dates", ar: "بحث عن تواريخ" },
  fbooking: { en: "Chose a room", ar: "اختار غرفة" },
  freview: { en: "Entered guest details", ar: "أدخل بيانات الضيف" },
  fconfirmed: { en: "Booked", ar: "أكمل الحجز" },
  conversion: { en: "Conversion rate", ar: "معدل التحويل" },
  ofPrev: { en: "of previous step", ar: "من الخطوة السابقة" },
  roomInterest: { en: "Rooms chosen on the website", ar: "الغرف المختارة على الموقع" },
  // revenue
  revenue: { en: "Revenue & occupancy", ar: "الإيرادات والإشغال" },
  revenueHint: { en: "Nights stayed in the period (future dates = on the books). Room revenue is net of discounts, before taxes.", ar: "الليالي المقيمة في الفترة (التواريخ المستقبلية = حجوزات مؤكدة). إيراد الغرف بعد الخصم وقبل الضرائب." },
  occupancy: { en: "Occupancy", ar: "الإشغال" },
  roomNights: { en: "room-nights sold", ar: "ليلة غرفة مباعة" },
  roomRevenue: { en: "Room revenue", ar: "إيراد الغرف" },
  adr: { en: "Average daily rate", ar: "متوسط السعر اليومي" },
  revpar: { en: "RevPAR", ar: "الإيراد لكل غرفة متاحة" },
  totalRevenue: { en: "Total incl. taxes & add-ons", ar: "الإجمالي شامل الضرائب والإضافات" },
  taxes: { en: "Service + tourism + VAT", ar: "الخدمة + السياحة + الضريبة" },
  dailyOcc: { en: "Occupancy per night", ar: "الإشغال لكل ليلة" },
  byCategory: { en: "By room category", ar: "حسب فئة الغرفة" },
  byMonth: { en: "By month", ar: "حسب الشهر" },
  category: { en: "Category", ar: "الفئة" },
  rooms: { en: "Rooms", ar: "الغرف" },
  sold: { en: "Nights sold", ar: "الليالي المباعة" },
  month: { en: "Month", ar: "الشهر" },
  // patterns
  patterns: { en: "Booking patterns", ar: "أنماط الحجز" },
  patternsHint: { en: "Bookings made in the period (by booking date).", ar: "الحجوزات التي تمت في الفترة (حسب تاريخ الحجز)." },
  bookings: { en: "Bookings made", ar: "الحجوزات" },
  bookedValue: { en: "Booked value", ar: "قيمة الحجوزات" },
  cancelRate: { en: "Cancelled / no-show", ar: "ملغاة / لم يحضر" },
  leadTime: { en: "Avg. booking lead time", ar: "متوسط المدة قبل الوصول" },
  los: { en: "Avg. length of stay", ar: "متوسط مدة الإقامة" },
  party: { en: "Avg. guests per booking", ar: "متوسط الضيوف لكل حجز" },
  days: { en: "days", ar: "أيام" },
  nights: { en: "nights", ar: "ليالٍ" },
  bySource: { en: "Bookings by channel", ar: "الحجوزات حسب القناة" },
  leadDist: { en: "How far ahead guests book", ar: "كم يحجز الضيوف مسبقاً" },
  losDist: { en: "Length of stay", ar: "مدة الإقامة" },
  addons: { en: "Add-on sales", ar: "مبيعات الإضافات" },
  addon: { en: "Add-on", ar: "الإضافة" },
  qty: { en: "Qty", ar: "الكمية" },
  promos: { en: "Promo codes", ar: "رموز الخصم" },
  code: { en: "Code", ar: "الرمز" },
  discount: { en: "Discount", ar: "الخصم" },
  nationalities: { en: "Guest nationalities", ar: "جنسيات الضيوف" },
  none: { en: "Nothing in this period.", ar: "لا شيء في هذه الفترة." },
  value: { en: "Value", ar: "القيمة" },
} satisfies Strings;

const PRESETS: RangePreset[] = ["7d", "30d", "90d", "mtd", "next30"];
const FUNNEL_LABEL: Record<FunnelStep["key"], keyof typeof STR> = {
  sessions: "fsessions",
  results: "fresults",
  booking: "fbooking",
  review: "freview",
  confirmed: "fconfirmed",
};

interface Props {
  preset: RangePreset;
  from: string;
  to: string;
  traffic: TrafficStats;
  funnel: { steps: FunnelStep[]; roomInterest: { key: string; value: number }[] };
  revenue: RevenueStats;
  patterns: PatternStats;
  types: { id: string; slug: string; name_en: string; name_ar: string }[];
  addons: { id: string; name_en: string; name_ar: string }[];
}

const omr = (v: number) => `OMR ${formatOmr(v)}`;
const int = (v: number) => Math.round(v).toLocaleString("en-US");

function countryName(code: string, lang: Lang): string {
  if (code === "unknown") return lang === "ar" ? "غير معروف" : "Unknown";
  try {
    return new Intl.DisplayNames([lang === "ar" ? "ar" : "en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s_-])\w/g, (m) => m.toUpperCase()).replace(/_/g, " ");
}

export function AnalyticsView({ preset, from, to, traffic, funnel, revenue, patterns, types, addons }: Props) {
  const { lang } = useLang();
  const [cf, setCf] = useState({ from, to });
  const typeName = (id: string) => {
    const t = types.find((x) => x.id === id || x.slug === id);
    return t ? (lang === "ar" ? t.name_ar : t.name_en) : id;
  };
  const addonName = (id: string) => {
    const a = addons.find((x) => x.id === id);
    return a ? (lang === "ar" ? a.name_ar : a.name_en) : id;
  };
  const short = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  const first = funnel.steps[0]?.sessions ?? 0;
  const confirmed = funnel.steps.find((s) => s.key === "confirmed")?.sessions ?? 0;

  return (
    <div>
      <PageHeader
        title={STR.title[lang]}
        subtitle={`${STR.subtitle[lang]} · ${fmtDate(from, lang)} – ${fmtDate(to, lang)}`}
        actions={
          <Link href="/reports" className="text-sm font-semibold text-maroon-700 underline-offset-2 hover:underline">
            {STR.reports[lang]} →
          </Link>
        }
      />

      {/* Range filter — one row above all charts */}
      <div className="mb-6 flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => (
          <Link
            key={p}
            href={`/analytics?range=${p}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              preset === p ? "border-maroon-800 bg-maroon-800 text-white" : "border-maroon-200 text-maroon-700 hover:bg-maroon-50",
            )}
          >
            {STR[`r${p}` as keyof typeof STR][lang]}
          </Link>
        ))}
        <form action="/analytics" className="ms-auto flex flex-wrap items-end gap-2">
          <input type="hidden" name="range" value="custom" />
          <label className="text-xs font-semibold text-maroon-500">
            {STR.from[lang]}
            <Input type="date" name="from" value={cf.from} onChange={(e) => setCf({ ...cf, from: e.target.value })} className="mt-0.5 h-9" />
          </label>
          <label className="text-xs font-semibold text-maroon-500">
            {STR.to[lang]}
            <Input type="date" name="to" value={cf.to} onChange={(e) => setCf({ ...cf, to: e.target.value })} className="mt-0.5 h-9" />
          </label>
          <Button type="submit" size="sm" variant={preset === "custom" ? "primary" : "outline"}>
            {STR.apply[lang]}
          </Button>
        </form>
      </div>

      {/* ---------------- Website traffic ---------------- */}
      <Section title={STR.traffic[lang]} hint={STR.trafficHint[lang]}>
        <StatGrid>
          <StatTile label={STR.visitors[lang]} value={int(traffic.visitors)} />
          <StatTile label={STR.sessions[lang]} value={int(traffic.sessions)} />
          <StatTile label={STR.pageviews[lang]} value={int(traffic.pageviews)} />
          <StatTile label={STR.pps[lang]} value={traffic.pagesPerSession.toFixed(1)} />
          <StatTile label={STR.bounce[lang]} value={pct(traffic.bounceRate)} sub={STR.bounceSub[lang]} />
          <StatTile label={STR.conversion[lang]} value={first ? pct(confirmed / first, 1) : "—"} sub={`${int(confirmed)} / ${int(first)}`} />
        </StatGrid>
        <Panel title={STR.dailyVisitors[lang]} className="mt-3">
          {traffic.pageviews === 0 ? (
            <p className="py-8 text-center text-sm text-maroon-400">{STR.noTraffic[lang]}</p>
          ) : (
            <ColumnChart ariaLabel={STR.dailyVisitors[lang]} points={traffic.daily.map((d) => ({ label: fmtDate(d.date, lang), short: short(d.date), value: d.visitors }))} format={int} />
          )}
        </Panel>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Panel title={STR.sources[lang]}>
            <BarList rows={traffic.sources.map((r) => ({ key: r.key, label: titleCase(r.key), value: r.value }))} total={traffic.sessions} format={int} empty={STR.none[lang]} />
          </Panel>
          <Panel title={STR.pages[lang]}>
            <BarList rows={traffic.pages.map((r) => ({ key: r.key, label: r.key, value: r.value }))} format={int} empty={STR.none[lang]} />
          </Panel>
          <Panel title={STR.countries[lang]}>
            <BarList rows={traffic.countries.map((r) => ({ key: r.key, label: countryName(r.key, lang), value: r.value }))} total={traffic.sessions} format={int} empty={STR.none[lang]} />
          </Panel>
          <Panel title={STR.devices[lang]}>
            <BarList rows={traffic.devices.map((r) => ({ key: r.key, label: titleCase(r.key), value: r.value }))} total={traffic.sessions} format={int} empty={STR.none[lang]} />
          </Panel>
          <Panel title={STR.languages[lang]}>
            <BarList rows={traffic.languages.map((r) => ({ key: r.key, label: r.key === "ar" ? "العربية" : r.key === "en" ? "English" : titleCase(r.key), value: r.value }))} total={traffic.sessions} format={int} empty={STR.none[lang]} />
          </Panel>
          <Panel title={STR.browsers[lang]}>
            <BarList rows={traffic.browsers.map((r) => ({ key: r.key, label: r.key, value: r.value }))} total={traffic.sessions} format={int} empty={STR.none[lang]} />
          </Panel>
        </div>
      </Section>

      {/* ---------------- Booking funnel ---------------- */}
      <Section title={STR.funnel[lang]} hint={STR.funnelHint[lang]}>
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <ol className="space-y-3">
              {funnel.steps.map((s, i) => {
                const prev = i > 0 ? funnel.steps[i - 1].sessions : 0;
                return (
                  <li key={s.key} data-testid={`funnel-${s.key}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-semibold text-maroon-900">
                        {i + 1}. {STR[FUNNEL_LABEL[s.key]][lang]}
                      </span>
                      <span className="tabular-nums text-maroon-700">
                        <b>{int(s.sessions)}</b>
                        {i > 0 && (
                          <span className="ms-2 text-xs text-maroon-400">
                            {prev ? pct(s.sessions / prev) : "—"} {STR.ofPrev[lang]}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-3 rounded bg-maroon-50">
                      <div className="h-3 rounded bg-maroon-700" style={{ width: `${first ? (s.sessions / first) * 100 : 0}%`, minWidth: s.sessions ? 4 : 0 }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>
          <Panel title={STR.roomInterest[lang]}>
            <BarList rows={funnel.roomInterest.map((r) => ({ key: r.key, label: typeName(r.key), value: r.value }))} format={int} empty={STR.none[lang]} />
          </Panel>
        </div>
      </Section>

      {/* ---------------- Revenue & occupancy ---------------- */}
      <Section title={STR.revenue[lang]} hint={STR.revenueHint[lang]}>
        <StatGrid>
          <StatTile label={STR.occupancy[lang]} value={pct(revenue.occupancy, 1)} sub={`${int(revenue.roomNightsSold)} / ${int(revenue.roomNightsAvailable)} ${STR.roomNights[lang]}`} />
          <StatTile label={STR.roomRevenue[lang]} value={omr(revenue.roomRevenue)} />
          <StatTile label={STR.adr[lang]} value={omr(revenue.adr)} />
          <StatTile label={STR.revpar[lang]} value={omr(revenue.revpar)} />
          <StatTile label={STR.taxes[lang]} value={omr(revenue.serviceCharge + revenue.tourismFee + revenue.vat)} sub={`${formatOmr(revenue.serviceCharge)} + ${formatOmr(revenue.tourismFee)} + ${formatOmr(revenue.vat)}`} />
          <StatTile label={STR.totalRevenue[lang]} value={omr(revenue.totalRevenue)} sub={`${STR.addons[lang]}: ${formatOmr(revenue.addons)}`} />
        </StatGrid>
        <Panel title={STR.dailyOcc[lang]} className="mt-3">
          <ColumnChart
            ariaLabel={STR.dailyOcc[lang]}
            points={revenue.daily.map((d) => ({ label: `${fmtDate(d.date, lang)} · ${d.sold}/${d.available} · ${omr(d.roomRevenue)}`, short: short(d.date), value: d.occupancy * 100 }))}
            format={(v) => `${Math.round(v)}%`}
          />
        </Panel>
        <div className="mt-3 grid gap-3">
          <Panel title={STR.byCategory[lang]} flush>
            <Table>
              <THead>
                <tr>
                  <TH>{STR.category[lang]}</TH>
                  <TH className="text-end">{STR.rooms[lang]}</TH>
                  <TH className="text-end">{STR.sold[lang]}</TH>
                  <TH className="text-end">{STR.occupancy[lang]}</TH>
                  <TH className="text-end">{STR.roomRevenue[lang]}</TH>
                  <TH className="text-end">ADR</TH>
                </tr>
              </THead>
              <TBody>
                {revenue.byCategory.map((c) => (
                  <TR key={c.room_type_id}>
                    <TD className="font-semibold text-maroon-900">{typeName(c.room_type_id)}</TD>
                    <TD className="text-end tabular-nums">{c.rooms}</TD>
                    <TD className="text-end tabular-nums">{int(c.sold)}</TD>
                    <TD className="text-end tabular-nums">{pct(c.occupancy, 1)}</TD>
                    <TD className="text-end tabular-nums">{formatOmr(c.roomRevenue)}</TD>
                    <TD className="text-end tabular-nums">{formatOmr(c.adr)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Panel>
          <Panel title={STR.byMonth[lang]} flush>
            <Table>
              <THead>
                <tr>
                  <TH>{STR.month[lang]}</TH>
                  <TH className="text-end">{STR.sold[lang]}</TH>
                  <TH className="text-end">{STR.occupancy[lang]}</TH>
                  <TH className="text-end">{STR.roomRevenue[lang]}</TH>
                  <TH className="text-end">ADR</TH>
                  <TH className="text-end">RevPAR</TH>
                </tr>
              </THead>
              <TBody>
                {revenue.monthly.map((m) => (
                  <TR key={m.month}>
                    <TD className="font-semibold text-maroon-900">{new Date(`${m.month}-15T12:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-OM" : "en-GB", { month: "long", year: "numeric" })}</TD>
                    <TD className="text-end tabular-nums">{int(m.sold)}</TD>
                    <TD className="text-end tabular-nums">{pct(m.occupancy, 1)}</TD>
                    <TD className="text-end tabular-nums">{formatOmr(m.roomRevenue)}</TD>
                    <TD className="text-end tabular-nums">{formatOmr(m.adr)}</TD>
                    <TD className="text-end tabular-nums">{formatOmr(m.revpar)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Panel>
        </div>
      </Section>

      {/* ---------------- Booking patterns ---------------- */}
      <Section title={STR.patterns[lang]} hint={STR.patternsHint[lang]}>
        <StatGrid>
          <StatTile label={STR.bookings[lang]} value={int(patterns.bookings)} />
          <StatTile label={STR.bookedValue[lang]} value={omr(patterns.bookedValue)} />
          <StatTile label={STR.cancelRate[lang]} value={pct(patterns.cancellationRate, 1)} sub={`${patterns.cancelled} + ${patterns.noShow}`} />
          <StatTile label={STR.leadTime[lang]} value={`${patterns.avgLeadTime.toFixed(1)} ${STR.days[lang]}`} />
          <StatTile label={STR.los[lang]} value={`${patterns.avgLengthOfStay.toFixed(1)} ${STR.nights[lang]}`} />
          <StatTile label={STR.party[lang]} value={patterns.avgPartySize.toFixed(1)} />
        </StatGrid>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Panel title={STR.bySource[lang]}>
            <BarList
              rows={patterns.bySource.map((s) => ({ key: s.key, label: sourceLabel(s.key, lang), value: s.bookings, extra: `· ${omr(s.value)}` }))}
              total={patterns.bookings}
              format={int}
              empty={STR.none[lang]}
            />
          </Panel>
          <Panel title={STR.leadDist[lang]}>
            <BarList rows={patterns.leadTime.map((r) => ({ key: r.key, label: r.key, value: r.value }))} total={patterns.live} format={int} empty={STR.none[lang]} />
          </Panel>
          <Panel title={STR.losDist[lang]}>
            <BarList rows={patterns.lengthOfStay.map((r) => ({ key: r.key, label: r.key, value: r.value }))} total={patterns.live} format={int} empty={STR.none[lang]} />
          </Panel>
          <Panel title={STR.addons[lang]}>
            <BarList rows={patterns.addons.map((a) => ({ key: a.addon_id, label: addonName(a.addon_id), value: a.revenue, extra: `· ${STR.qty[lang]} ${a.quantity}` }))} format={omr} empty={STR.none[lang]} />
          </Panel>
          <Panel title={STR.promos[lang]}>
            <BarList rows={patterns.promos.map((p) => ({ key: p.code, label: p.code, value: p.bookings, extra: `· −${formatOmr(p.discount)}` }))} format={int} empty={STR.none[lang]} />
          </Panel>
          <Panel title={STR.nationalities[lang]}>
            <BarList rows={patterns.nationalities.map((r) => ({ key: r.key, label: r.key.length === 2 ? countryName(r.key, lang) : r.key, value: r.value }))} total={patterns.live} format={int} empty={STR.none[lang]} />
          </Panel>
        </div>
      </Section>
    </div>
  );
}
