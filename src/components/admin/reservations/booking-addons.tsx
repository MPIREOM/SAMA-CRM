"use client";

import { useState, type FormEvent } from "react";
import { Car, CheckCircle2, Plus, Sparkles, XCircle, Zap } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkAddon, BkBookingAddon } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addBookingAddon, setBookingAddonStatus } from "@/app/(crm)/(app)/reservations/actions";
import { ADDON_TRANSITIONS, addonStatusLabel, addonStatusVariant, addonUnitLabel, fmtMoney, localName } from "../shared";

/** Catalogue entry offered in the "Add add-on" control. */
export type AddonOption = Pick<
  BkAddon,
  "id" | "slug" | "kind" | "name_en" | "name_ar" | "unit" | "max_quantity" | "taxable" | "requires_note" | "note_hint_en" | "note_hint_ar"
> & { price_omr: number };

/** A booked line with its catalogue row (numbers already coerced). */
export type BookingAddonLine = Omit<BkBookingAddon, "unit_price_omr" | "total_omr"> & {
  unit_price_omr: number;
  total_omr: number;
  addon: (Omit<BkAddon, "price_omr"> & { price_omr: number }) | null;
};

const STR = {
  title: { en: "Add-ons", ar: "الإضافات" },
  none: { en: "No add-ons on this booking", ar: "لا توجد إضافات على هذا الحجز" },
  confirm: { en: "Confirm", ar: "تأكيد" },
  done: { en: "Mark done", ar: "تم" },
  cancelLine: { en: "Cancel", ar: "إلغاء" },
  add: { en: "Add add-on", ar: "إضافة" },
  addTitle: { en: "Add an add-on", ar: "إضافة عنصر" },
  addon: { en: "Add-on", ar: "الإضافة" },
  quantity: { en: "Quantity", ar: "الكمية" },
  note: { en: "Note for the team (time, day, riders…)", ar: "ملاحظة للفريق (الوقت، اليوم، عدد الراكبين…)" },
  lineTotal: { en: "Line total", ar: "إجمالي السطر" },
  taxableTag: { en: "taxable", ar: "خاضع للضريبة" },
  total: { en: "Add-ons total", ar: "إجمالي الإضافات" },
  hint: { en: "Priced from the catalogue; the booking total is recalculated.", ar: "يُسعّر من القائمة ويُعاد احتساب إجمالي الحجز." },
  pickup: { en: "4WD pickup", ar: "استقبال بالدفع الرباعي" },
} satisfies Strings;

type Result = { ok: true } | { ok: false; error: string };

function LineIcon({ kind }: { kind: string | undefined }) {
  if (kind === "transfer") return <Car className="h-4 w-4 shrink-0 text-maroon-500" />;
  if (kind === "activity") return <Zap className="h-4 w-4 shrink-0 text-gold-600" />;
  return <Sparkles className="h-4 w-4 shrink-0 text-maroon-400" />;
}

export function BookingAddonsCard({
  bookingId,
  lines,
  addonsOmr,
  catalogue,
  live,
  pending,
  run,
}: {
  bookingId: string;
  lines: BookingAddonLine[];
  addonsOmr: number;
  catalogue: AddonOption[];
  /** False once the booking is cancelled / no-show / checked out — no more changes. */
  live: boolean;
  pending: boolean;
  /** The detail page's action runner (error/notice handling + refresh). */
  run: (fn: () => Promise<Result>, success?: string) => void;
}) {
  const { lang } = useLang();
  const [adding, setAdding] = useState(false);
  const [addonId, setAddonId] = useState(catalogue[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  const chosen = catalogue.find((a) => a.id === addonId) ?? null;
  const taken = new Set(lines.filter((l) => l.status !== "cancelled").map((l) => l.addon_id));

  function submitAdd(e: FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    run(async () => {
      const r = await addBookingAddon({ bookingId, addonId: chosen.id, quantity, note: note.trim() || null });
      if (r.ok) {
        setAdding(false);
        setQuantity(1);
        setNote("");
      }
      return r;
    });
  }

  return (
    <Card data-testid="booking-addons">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{STR.title[lang]}</CardTitle>
        {live && catalogue.length > 0 && !adding && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            {STR.add[lang]}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {lines.length === 0 ? (
          <p className="text-maroon-400">{STR.none[lang]}</p>
        ) : (
          <ul className="divide-y divide-maroon-100">
            {lines.map((l) => {
              const allowed = live ? ADDON_TRANSITIONS[l.status as keyof typeof ADDON_TRANSITIONS] ?? [] : [];
              const name = l.addon ? localName(l.addon, lang) : l.addon_id;
              return (
                <li key={l.id} data-testid="booking-addon-line" data-status={l.status} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
                  <LineIcon kind={l.addon?.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-maroon-900">{name}</p>
                    <p className="text-xs text-maroon-500">
                      {l.quantity} × {fmtMoney(l.unit_price_omr, lang)} {l.addon ? `(${addonUnitLabel(l.addon.unit, lang)})` : ""}
                      {l.taxable ? ` · ${STR.taxableTag[lang]}` : ""}
                    </p>
                    {l.note && (
                      <p className="mt-0.5 rounded bg-gold-50 px-2 py-1 text-xs text-maroon-800" dir="auto">
                        {l.note}
                      </p>
                    )}
                  </div>
                  <span className="font-semibold text-maroon-900">{fmtMoney(l.total_omr, lang)}</span>
                  <Badge variant={addonStatusVariant(l.status)} data-testid="addon-status">
                    {addonStatusLabel(l.status, lang)}
                  </Badge>
                  {allowed.length > 0 && (
                    <div className="flex basis-full justify-end gap-1">
                      {allowed.includes("confirmed") && (
                        <Button size="sm" variant="gold" loading={pending} onClick={() => run(() => setBookingAddonStatus({ bookingId, lineId: l.id, status: "confirmed" }))}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {STR.confirm[lang]}
                        </Button>
                      )}
                      {allowed.includes("done") && (
                        <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => setBookingAddonStatus({ bookingId, lineId: l.id, status: "done" }))}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {STR.done[lang]}
                        </Button>
                      )}
                      {allowed.includes("cancelled") && (
                        <Button size="sm" variant="ghost" className="text-crimson-700" loading={pending} onClick={() => run(() => setBookingAddonStatus({ bookingId, lineId: l.id, status: "cancelled" }))}>
                          <XCircle className="h-3.5 w-3.5" />
                          {STR.cancelLine[lang]}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {lines.length > 0 && (
          <div className="flex justify-between border-t border-maroon-200 pt-2 font-bold text-maroon-900">
            <span>{STR.total[lang]}</span>
            <span>{fmtMoney(addonsOmr, lang)}</span>
          </div>
        )}

        {adding && chosen && (
          <form onSubmit={submitAdd} className="space-y-3 rounded-lg border border-gold-200 bg-gold-50/40 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-maroon-500">{STR.addTitle[lang]}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
              <div>
                <Label htmlFor="ba-addon">{STR.addon[lang]}</Label>
                <Select
                  id="ba-addon"
                  value={addonId}
                  onChange={(e) => {
                    setAddonId(e.target.value);
                    setQuantity(1);
                  }}
                >
                  {catalogue.map((a) => (
                    <option key={a.id} value={a.id} disabled={taken.has(a.id)}>
                      {localName(a, lang)} · {fmtMoney(a.price_omr, lang)} {addonUnitLabel(a.unit, lang)}
                      {taken.has(a.id) ? " ✓" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="ba-qty">{STR.quantity[lang]}</Label>
                <Input
                  id="ba-qty"
                  type="number"
                  min={1}
                  max={chosen.max_quantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(chosen.max_quantity, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ba-note">{STR.note[lang]}</Label>
              <Textarea id="ba-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={(lang === "ar" ? chosen.note_hint_ar : chosen.note_hint_en) ?? undefined} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-maroon-500">
                {STR.lineTotal[lang]}: <span className="font-semibold text-maroon-900">{fmtMoney(chosen.price_omr * quantity, lang)}</span>
                {chosen.unit === "per_night" ? ` × ${COMMON.nights[lang].toLowerCase()}` : ""}
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAdding(false)}>
                  {COMMON.cancel[lang]}
                </Button>
                <Button type="submit" size="sm" loading={pending} disabled={taken.has(chosen.id)}>
                  <Plus className="h-3.5 w-3.5" />
                  {COMMON.add[lang]}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-maroon-400">{STR.hint[lang]}</p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
