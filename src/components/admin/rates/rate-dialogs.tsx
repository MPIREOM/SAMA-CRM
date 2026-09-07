"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { addDays } from "@/lib/booking-engine/pricing";
import { muscatToday } from "@/lib/booking-engine/dates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { bulkSetRate, saveRatePlan, stopSell } from "@/app/(crm)/(app)/rates/actions";
import { InlineAlert } from "../load-error";
import { WEEKDAYS, fmtDate, localName } from "../shared";
import type { RatePlanRow, RateType } from "./rates-view";

const STR = {
  newPlan: { en: "New rate plan", ar: "خطة أسعار جديدة" },
  editPlan: { en: "Edit rate plan", ar: "تعديل خطة الأسعار" },
  name: { en: "Name", ar: "الاسم" },
  allTypes: { en: "All room types", ar: "كل أنواع الغرف" },
  start: { en: "Start date", ar: "تاريخ البداية" },
  endIncl: { en: "End date (inclusive)", ar: "تاريخ النهاية (شامل)" },
  mode: { en: "Pricing", ar: "التسعير" },
  fixed: { en: "Fixed rate (OMR)", ar: "سعر ثابت (ر.ع)" },
  percent: { en: "Adjust base by %", ar: "تعديل السعر الأساسي بنسبة %" },
  rate: { en: "Rate (OMR / night)", ar: "السعر (ر.ع / ليلة)" },
  pct: { en: "Adjustment % (e.g. 20 or -10)", ar: "نسبة التعديل % (مثال 20 أو -10)" },
  minStay: { en: "Minimum stay (nights)", ar: "الحد الأدنى للإقامة (ليالٍ)" },
  days: { en: "Days of week (none = every day)", ar: "أيام الأسبوع (لا شيء = كل الأيام)" },
  priority: { en: "Priority (higher wins)", ar: "الأولوية (الأعلى يفوز)" },
  active: { en: "Active", ar: "نشطة" },
  bulkTitle: { en: "Bulk set rate", ar: "تعيين سعر جماعي" },
  bulkHint: { en: "Creates a priority-50 plan per selected type (or one plan for all types).", ar: "ينشئ خطة بأولوية 50 لكل نوع محدد (أو خطة واحدة لكل الأنواع)." },
  types: { en: "Room types (none = all)", ar: "أنواع الغرف (لا شيء = الكل)" },
  stopTitle: { en: "Stop sell", ar: "إيقاف البيع" },
  stopHint: { en: "Removes the whole room type from sale for these nights. Existing bookings are kept.", ar: "يزيل نوع الغرفة بالكامل من البيع لهذه الليالي. تبقى الحجوزات الحالية." },
  firstNight: { en: "First blocked night", ar: "أول ليلة موقوفة" },
  nights: { en: "Nights", ar: "الليالي" },
  until: { en: "Sellable again from", ar: "يعود للبيع من" },
  reason: { en: "Reason (optional)", ar: "السبب (اختياري)" },
  created: { en: "Created", ar: "تم الإنشاء" },
} satisfies Strings;

function DaysPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { lang } = useLang();
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {WEEKDAYS.map((d) => (
        <Checkbox
          key={d.value}
          label={d[lang]}
          checked={value.includes(d.value)}
          onChange={(e) => onChange(e.target.checked ? [...value, d.value] : value.filter((v) => v !== d.value))}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

type PlanForm = {
  name: string;
  room_type_id: string;
  start_date: string;
  end_date: string;
  mode: "fixed" | "pct";
  rate_omr: string;
  adjust_pct: string;
  min_stay: number;
  days: number[];
  priority: number;
  is_active: boolean;
};

function planToForm(p: RatePlanRow | "new" | null, today: string): PlanForm {
  if (!p || p === "new") {
    return { name: "", room_type_id: "", start_date: today, end_date: addDays(today, 30), mode: "fixed", rate_omr: "", adjust_pct: "", min_stay: 1, days: [], priority: 10, is_active: true };
  }
  return {
    name: p.name,
    room_type_id: p.room_type_id ?? "",
    start_date: p.start_date,
    end_date: p.end_date,
    mode: p.rate_omr !== null ? "fixed" : "pct",
    rate_omr: p.rate_omr !== null ? String(p.rate_omr) : "",
    adjust_pct: p.adjust_pct !== null ? String(p.adjust_pct) : "",
    min_stay: p.min_stay,
    days: p.days_of_week ?? [],
    priority: p.priority,
    is_active: p.is_active,
  };
}

export function RatePlanDialog({ plan, types, onClose }: { plan: RatePlanRow | "new" | null; types: RateType[]; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = muscatToday();
  const [f, setF] = useState<PlanForm>(planToForm(plan, today));

  useEffect(() => {
    setF(planToForm(plan, today));
    setError(null);
  }, [plan, today]);

  if (!plan) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await saveRatePlan({
        id: plan !== "new" && plan ? plan.id : null,
        name: f.name,
        room_type_id: f.room_type_id || null,
        start_date: f.start_date,
        end_date: f.end_date,
        rate_omr: f.mode === "fixed" ? Number(f.rate_omr) : null,
        adjust_pct: f.mode === "pct" ? Number(f.adjust_pct) : null,
        min_stay: f.min_stay,
        days_of_week: f.days.length ? f.days : null,
        priority: f.priority,
        is_active: f.is_active,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={plan === "new" ? STR.newPlan[lang] : STR.editPlan[lang]}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="p-name">{STR.name[lang]}</Label>
          <Input id="p-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus />
        </div>
        <div>
          <Label htmlFor="p-type">{COMMON.roomType[lang]}</Label>
          <Select id="p-type" value={f.room_type_id} onChange={(e) => setF({ ...f, room_type_id: e.target.value })}>
            <option value="">{STR.allTypes[lang]}</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {localName(t, lang)}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="p-start">{STR.start[lang]}</Label>
            <Input id="p-start" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="p-end">{STR.endIncl[lang]}</Label>
            <Input id="p-end" type="date" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="p-mode">{STR.mode[lang]}</Label>
            <Select id="p-mode" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value === "pct" ? "pct" : "fixed" })}>
              <option value="fixed">{STR.fixed[lang]}</option>
              <option value="pct">{STR.percent[lang]}</option>
            </Select>
          </div>
          <div>
            {f.mode === "fixed" ? (
              <>
                <Label htmlFor="p-rate">{STR.rate[lang]}</Label>
                <Input id="p-rate" type="number" step="0.001" min={0} dir="ltr" value={f.rate_omr} onChange={(e) => setF({ ...f, rate_omr: e.target.value })} required />
              </>
            ) : (
              <>
                <Label htmlFor="p-pct">{STR.pct[lang]}</Label>
                <Input id="p-pct" type="number" step="0.01" min={-100} max={1000} dir="ltr" value={f.adjust_pct} onChange={(e) => setF({ ...f, adjust_pct: e.target.value })} required />
              </>
            )}
          </div>
          <div>
            <Label htmlFor="p-min">{STR.minStay[lang]}</Label>
            <Input id="p-min" type="number" min={1} max={30} value={f.min_stay} onChange={(e) => setF({ ...f, min_stay: Number(e.target.value) || 1 })} />
          </div>
          <div>
            <Label htmlFor="p-prio">{STR.priority[lang]}</Label>
            <Input id="p-prio" type="number" min={-1000} max={1000} value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <div>
          <Label>{STR.days[lang]}</Label>
          <DaysPicker value={f.days} onChange={(days) => setF({ ...f, days })} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} label={STR.active[lang]} />
          <span className="text-sm font-semibold text-maroon-800">{STR.active[lang]}</span>
        </div>
        <InlineAlert kind="error" message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" loading={pending}>
            {COMMON.save[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function BulkRateDialog({ open, types, onClose }: { open: boolean; types: RateType[]; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = muscatToday();
  const [f, setF] = useState({ ids: [] as string[], start_date: today, end_date: addDays(today, 30), mode: "fixed" as "fixed" | "pct", rate_omr: "", adjust_pct: "", days: [] as number[], name: "" });

  useEffect(() => {
    if (open) {
      setF({ ids: [], start_date: today, end_date: addDays(today, 30), mode: "fixed", rate_omr: "", adjust_pct: "", days: [], name: "" });
      setError(null);
    }
  }, [open, today]);

  if (!open) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await bulkSetRate({
        room_type_ids: f.ids,
        start_date: f.start_date,
        end_date: f.end_date,
        rate_omr: f.mode === "fixed" ? Number(f.rate_omr) : null,
        adjust_pct: f.mode === "pct" ? Number(f.adjust_pct) : null,
        days_of_week: f.days.length ? f.days : null,
        name: f.name || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={STR.bulkTitle[lang]}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-maroon-400">{STR.bulkHint[lang]}</p>
        <div>
          <Label>{STR.types[lang]}</Label>
          <div className="grid grid-cols-2 gap-1">
            {types.map((t) => (
              <Checkbox
                key={t.id}
                label={localName(t, lang)}
                checked={f.ids.includes(t.id)}
                onChange={(e) => setF({ ...f, ids: e.target.checked ? [...f.ids, t.id] : f.ids.filter((id) => id !== t.id) })}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="b-start">{STR.start[lang]}</Label>
            <Input id="b-start" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="b-end">{STR.endIncl[lang]}</Label>
            <Input id="b-end" type="date" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="b-mode">{STR.mode[lang]}</Label>
            <Select id="b-mode" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value === "pct" ? "pct" : "fixed" })}>
              <option value="fixed">{STR.fixed[lang]}</option>
              <option value="pct">{STR.percent[lang]}</option>
            </Select>
          </div>
          <div>
            {f.mode === "fixed" ? (
              <>
                <Label htmlFor="b-rate">{STR.rate[lang]}</Label>
                <Input id="b-rate" type="number" step="0.001" min={0} dir="ltr" value={f.rate_omr} onChange={(e) => setF({ ...f, rate_omr: e.target.value })} required />
              </>
            ) : (
              <>
                <Label htmlFor="b-pct">{STR.pct[lang]}</Label>
                <Input id="b-pct" type="number" step="0.01" dir="ltr" value={f.adjust_pct} onChange={(e) => setF({ ...f, adjust_pct: e.target.value })} required />
              </>
            )}
          </div>
          <div className="col-span-2">
            <Label htmlFor="b-name">{STR.name[lang]} ({COMMON.optional[lang]})</Label>
            <Input id="b-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>{STR.days[lang]}</Label>
          <DaysPicker value={f.days} onChange={(days) => setF({ ...f, days })} />
        </div>
        <InlineAlert kind="error" message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" loading={pending}>
            {COMMON.create[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function StopSellDialog({ open, types, today, onClose }: { open: boolean; types: RateType[]; today: string; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ room_type_id: types[0]?.id ?? "", start_date: today, nights: 1, reason: "" });

  useEffect(() => {
    if (open) {
      setF({ room_type_id: types[0]?.id ?? "", start_date: today, nights: 1, reason: "" });
      setError(null);
    }
  }, [open, today, types]);

  if (!open) return null;
  const endDate = addDays(f.start_date, Math.max(1, f.nights));

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await stopSell({ room_type_id: f.room_type_id, start_date: f.start_date, end_date: endDate, reason: f.reason || null });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={STR.stopTitle[lang]}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-maroon-400">{STR.stopHint[lang]}</p>
        <div>
          <Label htmlFor="ss-type">{COMMON.roomType[lang]}</Label>
          <Select id="ss-type" value={f.room_type_id} onChange={(e) => setF({ ...f, room_type_id: e.target.value })} required>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {localName(t, lang)}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ss-start">{STR.firstNight[lang]}</Label>
            <Input id="ss-start" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="ss-nights">{STR.nights[lang]}</Label>
            <Input id="ss-nights" type="number" min={1} max={365} value={f.nights} onChange={(e) => setF({ ...f, nights: Math.max(1, Number(e.target.value) || 1) })} />
            <p className="mt-1 text-xs text-maroon-400">
              {STR.until[lang]} {fmtDate(endDate, lang)}
            </p>
          </div>
        </div>
        <div>
          <Label htmlFor="ss-reason">{STR.reason[lang]}</Label>
          <Input id="ss-reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} />
        </div>
        <InlineAlert kind="error" message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" variant="danger" loading={pending}>
            {STR.stopTitle[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
