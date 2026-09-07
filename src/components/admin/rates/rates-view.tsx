"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronLeft, ChevronRight, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkRatePlan } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { addDays, dayOfWeek, effectiveRate, formatOmr, nightsBetween, type RatePlanLike } from "@/lib/booking-engine/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { deleteRatePlan, setBaseRate } from "@/app/(crm)/(app)/rates/actions";
import { InlineAlert } from "../load-error";
import { WEEKDAYS, WEEKEND_DAYS, fmtDate, fmtMoney, fmtWeekday, localName } from "../shared";
import { RatePlanDialog, BulkRateDialog, StopSellDialog } from "./rate-dialogs";

export interface RateType {
  id: string;
  name_en: string;
  name_ar: string;
  base_rate_omr: number;
  sort_order: number;
  is_active: boolean;
}

export type RatePlanRow = Omit<BkRatePlan, "rate_omr" | "adjust_pct"> & { rate_omr: number | null; adjust_pct: number | null };

export interface RateBlock {
  id: string;
  room_id: string | null;
  room_type_id: string | null;
  start_date: string;
  end_date: string;
  kind: string;
  reason: string | null;
}

const STR = {
  subtitle: { en: "Base rates, seasonal plans and the effective price per night", ar: "الأسعار الأساسية والخطط الموسمية والسعر الفعلي لكل ليلة" },
  baseRates: { en: "Base rates", ar: "الأسعار الأساسية" },
  perNight: { en: "OMR / night", ar: "ر.ع / ليلة" },
  monthGrid: { en: "Effective rate per night", ar: "السعر الفعلي لكل ليلة" },
  gridHint: { en: "Highlighted = differs from base · hatched = stop sell · dot = room-level blocks", ar: "مظلل = يختلف عن الأساسي · مخطط = إيقاف بيع · نقطة = إغلاقات على مستوى الغرفة" },
  plans: { en: "Rate plans", ar: "خطط الأسعار" },
  newPlan: { en: "New plan", ar: "خطة جديدة" },
  bulk: { en: "Bulk set rate", ar: "تعيين سعر جماعي" },
  stopSell: { en: "Stop sell", ar: "إيقاف البيع" },
  name: { en: "Name", ar: "الاسم" },
  types: { en: "Type", ar: "النوع" },
  allTypes: { en: "All types", ar: "كل الأنواع" },
  dates: { en: "Dates", ar: "التواريخ" },
  rate: { en: "Rate / adjust", ar: "السعر / التعديل" },
  minStay: { en: "Min stay", ar: "الحد الأدنى" },
  days: { en: "Days", ar: "الأيام" },
  priority: { en: "Priority", ar: "الأولوية" },
  everyDay: { en: "Every day", ar: "كل الأيام" },
  noPlans: { en: "No rate plans", ar: "لا توجد خطط أسعار" },
  noPlansDesc: { en: "Base rates apply every night until you add seasonal or weekend plans.", ar: "تُطبّق الأسعار الأساسية كل ليلة حتى تضيف خططاً موسمية أو لعطلة نهاية الأسبوع." },
  confirmDelete: { en: "Delete this rate plan?", ar: "حذف خطة الأسعار هذه؟" },
  saved: { en: "Saved", ar: "تم الحفظ" },
  prevMonth: { en: "Previous month", ar: "الشهر السابق" },
  nextMonth: { en: "Next month", ar: "الشهر التالي" },
} satisfies Strings;

function monthDays(month: string): string[] {
  const start = `${month}-01`;
  const out: string[] = [];
  let d = start;
  while (d.slice(0, 7) === month) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((v) => parseInt(v, 10));
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function RatesView({
  month,
  today,
  types,
  plans,
  blocks,
}: {
  month: string;
  today: string;
  types: RateType[];
  plans: RatePlanRow[];
  blocks: RateBlock[];
}) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [baseEdits, setBaseEdits] = useState<Record<string, string>>({});
  const [planDialog, setPlanDialog] = useState<RatePlanRow | "new" | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);

  const days = useMemo(() => monthDays(month), [month]);
  const planLikes: RatePlanLike[] = useMemo(() => plans, [plans]);
  const typeById = new Map(types.map((t) => [t.id, t]));

  const stopSellFor = (typeId: string, date: string) =>
    blocks.find((b) => b.kind === "stop_sell" && b.room_id === null && b.room_type_id === typeId && b.start_date <= date && b.end_date > date);
  const roomBlocksFor = (typeId: string, date: string) =>
    blocks.filter((b) => b.room_id !== null && b.room_type_id === typeId && b.start_date <= date && b.end_date > date).length;

  function saveBase(t: RateType) {
    const raw = baseEdits[t.id];
    const value = Number(raw);
    if (raw === undefined || !Number.isFinite(value) || value < 0) return;
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await setBaseRate({ room_type_id: t.id, base_rate_omr: value });
      if (!r.ok) setError(r.error);
      else {
        setNotice(STR.saved[lang]);
        setBaseEdits((e) => {
          const next = { ...e };
          delete next[t.id];
          return next;
        });
        router.refresh();
      }
    });
  }

  function removePlan(p: RatePlanRow) {
    if (!window.confirm(STR.confirmDelete[lang])) return;
    setError(null);
    start(async () => {
      const r = await deleteRatePlan({ id: p.id });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  const monthLabel = new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T12:00:00Z`)
  );

  return (
    <div>
      <PageHeader
        title={COMMON.rates[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <>
            <Button variant="outline" onClick={() => setStopOpen(true)}>
              <Ban className="h-4 w-4" />
              {STR.stopSell[lang]}
            </Button>
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Layers className="h-4 w-4" />
              {STR.bulk[lang]}
            </Button>
            <Button onClick={() => setPlanDialog("new")}>
              <Plus className="h-4 w-4" />
              {STR.newPlan[lang]}
            </Button>
          </>
        }
      />

      <div className="mb-4 space-y-2">
        <InlineAlert kind="error" message={error} />
        <InlineAlert kind="success" message={notice} />
      </div>

      {/* Base rates */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{STR.baseRates[lang]}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => {
            const edit = baseEdits[t.id];
            const dirty = edit !== undefined && Number(edit) !== t.base_rate_omr;
            return (
              <div key={t.id} className={cn("flex items-center gap-2 rounded-lg border border-maroon-100 px-3 py-2", !t.is_active && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-maroon-900">{localName(t, lang)}</p>
                  <p className="text-[11px] text-maroon-400">{STR.perNight[lang]}</p>
                </div>
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  dir="ltr"
                  className="h-9 w-28 text-end"
                  value={edit ?? formatOmr(t.base_rate_omr)}
                  onChange={(e) => setBaseEdits({ ...baseEdits, [t.id]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), saveBase(t))}
                  aria-label={`${localName(t, lang)} ${STR.perNight[lang]}`}
                />
                <Button size="sm" variant={dirty ? "primary" : "outline"} disabled={!dirty || pending} onClick={() => saveBase(t)}>
                  {COMMON.save[lang]}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Month grid */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{STR.monthGrid[lang]}</CardTitle>
            <p className="text-xs text-maroon-400">{STR.gridHint[lang]}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" aria-label={STR.prevMonth[lang]} onClick={() => router.push(`/rates?month=${shiftMonth(month, -1)}`)}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <span className="min-w-[9rem] text-center text-sm font-bold text-maroon-900">{monthLabel}</span>
            <Button variant="outline" size="sm" aria-label={STR.nextMonth[lang]} onClick={() => router.push(`/rates?month=${shiftMonth(month, 1)}`)}>
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-maroon-50 text-maroon-500">
                <th className="sticky start-0 z-10 bg-maroon-50 px-3 py-2 text-start font-bold">{COMMON.roomType[lang]}</th>
                {days.map((d) => {
                  const dow = dayOfWeek(d);
                  return (
                    <th
                      key={d}
                      className={cn(
                        "min-w-[2.6rem] px-1 py-1.5 text-center font-semibold leading-tight",
                        d === today && "bg-gold-100 text-maroon-900",
                        WEEKEND_DAYS.includes(dow) && d !== today && "bg-maroon-100/60"
                      )}
                    >
                      <div className="text-[9px] uppercase">{fmtWeekday(d, lang)}</div>
                      <div>{parseInt(d.slice(8), 10)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-maroon-100">
              {types.map((t) => (
                <tr key={t.id} className={cn(!t.is_active && "opacity-50")}>
                  <td className="sticky start-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 font-semibold text-maroon-900">{localName(t, lang)}</td>
                  {days.map((d) => {
                    const rate = effectiveRate(t.base_rate_omr, planLikes, t.id, d);
                    const stop = stopSellFor(t.id, d);
                    const roomBlocks = roomBlocksFor(t.id, d);
                    const differs = rate !== t.base_rate_omr;
                    return (
                      <td
                        key={d}
                        title={stop ? `${STR.stopSell[lang]}${stop.reason ? ` · ${stop.reason}` : ""}` : roomBlocks ? `${roomBlocks} ${COMMON.blocks[lang]}` : undefined}
                        className={cn(
                          "relative px-1 py-1.5 text-center tabular-nums",
                          differs ? "bg-gold-50 font-bold text-maroon-900" : "text-maroon-600",
                          d === today && "ring-1 ring-inset ring-gold-400"
                        )}
                        style={
                          stop
                            ? { backgroundImage: "repeating-linear-gradient(45deg, rgba(132,66,75,0.25) 0 3px, transparent 3px 7px)" }
                            : undefined
                        }
                      >
                        {formatOmr(rate).replace(/\.000$/, "")}
                        {roomBlocks > 0 && <span className="absolute end-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-stone-500" aria-hidden />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Plans */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{STR.plans[lang]}</CardTitle>
        </CardHeader>
        {plans.length === 0 ? (
          <EmptyState
            title={STR.noPlans[lang]}
            description={STR.noPlansDesc[lang]}
            action={
              <Button onClick={() => setPlanDialog("new")}>
                <Plus className="h-4 w-4" />
                {STR.newPlan[lang]}
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{STR.name[lang]}</TH>
                <TH>{STR.types[lang]}</TH>
                <TH>{STR.dates[lang]}</TH>
                <TH>{STR.rate[lang]}</TH>
                <TH>{STR.minStay[lang]}</TH>
                <TH>{STR.days[lang]}</TH>
                <TH>{STR.priority[lang]}</TH>
                <TH>{COMMON.status[lang]}</TH>
                <TH className="ltr:text-right rtl:text-left">{COMMON.actions[lang]}</TH>
              </tr>
            </THead>
            <TBody>
              {plans.map((p) => (
                <TR key={p.id} className={cn(!p.is_active && "opacity-60")}>
                  <TD className="font-semibold text-maroon-900">{p.name}</TD>
                  <TD>{p.room_type_id ? localName(typeById.get(p.room_type_id) ?? null, lang) : <Badge variant="gold">{STR.allTypes[lang]}</Badge>}</TD>
                  <TD className="text-xs">
                    {fmtDate(p.start_date, lang)} → {fmtDate(p.end_date, lang)}
                    <span className="ms-1 text-maroon-400">({nightsBetween(p.start_date, p.end_date) + 1}d)</span>
                  </TD>
                  <TD className="font-semibold">{p.rate_omr !== null ? fmtMoney(p.rate_omr, lang) : `${p.adjust_pct! > 0 ? "+" : ""}${p.adjust_pct}%`}</TD>
                  <TD>{p.min_stay}</TD>
                  <TD className="text-xs">
                    {p.days_of_week && p.days_of_week.length > 0 && p.days_of_week.length < 7
                      ? p.days_of_week.map((d) => WEEKDAYS[d]?.[lang] ?? d).join(" ")
                      : STR.everyDay[lang]}
                  </TD>
                  <TD>{p.priority}</TD>
                  <TD>
                    <Badge variant={p.is_active ? "green" : "gray"}>{p.is_active ? COMMON.active[lang] : COMMON.inactive[lang]}</Badge>
                  </TD>
                  <TD className="ltr:text-right rtl:text-left">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPlanDialog(p)} aria-label={COMMON.edit[lang]}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-crimson-700" disabled={pending} onClick={() => removePlan(p)} aria-label={COMMON.delete[lang]}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <RatePlanDialog plan={planDialog} types={types} onClose={() => setPlanDialog(null)} />
      <BulkRateDialog open={bulkOpen} types={types} onClose={() => setBulkOpen(false)} />
      <StopSellDialog open={stopOpen} types={types} today={today} onClose={() => setStopOpen(false)} />
    </div>
  );
}
