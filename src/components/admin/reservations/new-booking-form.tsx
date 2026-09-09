"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Car, Minus, Plus, Sparkles, Zap } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { COUNTRY_CODES, normalizePhone } from "@/lib/phone";
import { nightsBetween } from "@/lib/booking-engine/pricing";
import type { QuoteResult } from "@/lib/bk/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createStaffBooking, freeRooms, quotePreview, type FreeRoom } from "@/app/(crm)/(app)/reservations/actions";
import { InlineAlert } from "../load-error";
import { STAFF_SOURCES, addonUnitLabel, fmtDate, fmtMoney, localName, sourceLabel, nightsLabel } from "../shared";
import type { AddonOption } from "./booking-addons";
import { asBedType, bedLabel, cleanBedOptions, sortRoomsForBed, type BedType } from "@/lib/booking-engine/beds";

const STR = {
  title: { en: "New booking", ar: "حجز جديد" },
  subtitle: { en: "Front-desk booking — bypasses website-only rules (min stay, capacity)", ar: "حجز من مكتب الاستقبال — لا تُطبّق قواعد الموقع (الحد الأدنى للإقامة، السعة)" },
  back: { en: "All reservations", ar: "كل الحجوزات" },
  stay: { en: "Stay", ar: "الإقامة" },
  guest: { en: "Guest", ar: "النزيل" },
  details: { en: "Booking details", ar: "تفاصيل الحجز" },
  guestName: { en: "Guest name", ar: "اسم النزيل" },
  localNumber: { en: "Local number", ar: "الرقم المحلي" },
  countryCode: { en: "Country", ar: "الدولة" },
  preferredLang: { en: "Preferred language", ar: "اللغة المفضلة" },
  roomOptional: { en: "Room (optional)", ar: "الغرفة (اختياري)" },
  noRoom: { en: "— assign later —", ar: "— التخصيص لاحقاً —" },
  noFreeRooms: { en: "No free rooms of this type for these dates", ar: "لا توجد غرف متاحة من هذا النوع لهذه التواريخ" },
  bedPreference: { en: "Bed layout", ar: "ترتيب الأسرّة" },
  promo: { en: "Promo code (optional)", ar: "رمز الخصم (اختياري)" },
  requests: { en: "Special requests", ar: "طلبات خاصة" },
  internal: { en: "Internal notes (staff only)", ar: "ملاحظات داخلية (للموظفين)" },
  quote: { en: "Quote", ar: "عرض السعر" },
  quoteHint: { en: "Live price from the booking engine", ar: "السعر المباشر من محرك الحجز" },
  available: { en: "available", ar: "متاح" },
  soldOut: { en: "Sold out for these dates — the booking will be refused.", ar: "لا توجد غرف متاحة لهذه التواريخ — سيتم رفض الحجز." },
  overCapacity: { en: "More guests than this room type normally takes (staff can override).", ar: "عدد النزلاء يفوق سعة نوع الغرفة (يمكن للموظفين تجاوز ذلك)." },
  promoInvalid: { en: "Promo code not valid", ar: "رمز الخصم غير صالح" },
  subtotal: { en: "Room subtotal", ar: "إجمالي الغرفة" },
  discount: { en: "Discount", ar: "الخصم" },
  service: { en: "Service charge", ar: "رسوم الخدمة" },
  tourism: { en: "Tourism fee", ar: "رسوم السياحة" },
  vat: { en: "VAT", ar: "ضريبة القيمة المضافة" },
  payAtHotel: { en: "Pay at the hotel", ar: "الدفع في الفندق" },
  create: { en: "Create booking", ar: "إنشاء الحجز" },
  errGuest: { en: "Please enter the guest name.", ar: "يرجى إدخال اسم النزيل." },
  errPhone: { en: "Please enter a valid phone number.", ar: "يرجى إدخال رقم هاتف صحيح." },
  errDates: { en: "Check-out must be after check-in.", ar: "يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول." },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  pending: { en: "Pending (hold)", ar: "قيد الانتظار (حجز مبدئي)" },
  addons: { en: "Add-ons", ar: "الإضافات" },
  addonsHint: { en: "APEX Zipline, 4WD transfers — priced from the catalogue, paid with the room", ar: "أبكس زيبلاين ونقل الدفع الرباعي — تُسعّر من القائمة وتُدفع مع الغرفة" },
  addonNote: { en: "Note for the team", ar: "ملاحظة للفريق" },
  addonsTotal: { en: "Add-ons", ar: "الإضافات" },
  decrease: { en: "Fewer", ar: "أقل" },
  increase: { en: "More", ar: "أكثر" },
  max: { en: "max", ar: "الحد الأقصى" },
} satisfies Strings;

export interface NewBookingType {
  id: string;
  name_en: string;
  name_ar: string;
  max_adults: number;
  max_children: number;
  base_rate_omr: number;
  is_active: boolean;
  /** Layouts the guest may choose (twin, king); empty = fixed layout. */
  bed_options: string[];
}

interface Props {
  types: NewBookingType[];
  /** Active add-ons (empty when none are configured). */
  addons: AddonOption[];
  today: string;
  initial: { room_type_id: string; room_id: string; check_in: string; check_out: string };
}

type AddonPick = { quantity: number; note: string };

function AddonIcon({ kind }: { kind: string }) {
  if (kind === "transfer") return <Car className="h-4 w-4 shrink-0 text-maroon-500" />;
  if (kind === "activity") return <Zap className="h-4 w-4 shrink-0 text-gold-600" />;
  return <Sparkles className="h-4 w-4 shrink-0 text-maroon-400" />;
}

export function NewBookingForm({ types, addons, initial }: Props) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    room_type_id: initial.room_type_id,
    room_id: initial.room_id,
    check_in: initial.check_in,
    check_out: initial.check_out,
    adults: 2,
    children: 0,
    guest_name: "",
    country: "+968",
    local: "",
    guest_email: "",
    nationality: "",
    preferred_lang: "ar" as "en" | "ar",
    source: "phone" as (typeof STAFF_SOURCES)[number],
    status: "confirmed" as "confirmed" | "pending",
    promo_code: "",
    special_requests: "",
    internal_notes: "",
    bed_preference: "" as BedType | "",
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Message language follows the guest's country code until staff override it:
  // Omani and GCC numbers default to Arabic, everything else to English.
  const [langTouched, setLangTouched] = useState(false);
  useEffect(() => {
    if (langTouched) return;
    const arabic = ["+968", "+966", "+971", "+965", "+974", "+973"].includes(form.country);
    setForm((f) => (f.preferred_lang === (arabic ? "ar" : "en") ? f : { ...f, preferred_lang: arabic ? "ar" : "en" }));
  }, [form.country, langTouched]);

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<FreeRoom[] | null>(null);

  // Add-on picks keyed by addon id; only quantities > 0 are sent.
  const [picks, setPicks] = useState<Record<string, AddonPick>>({});
  const pickOf = (id: string): AddonPick => picks[id] ?? { quantity: 0, note: "" };
  const setPick = (id: string, patch: Partial<AddonPick>) => setPicks((p) => ({ ...p, [id]: { ...(p[id] ?? { quantity: 0, note: "" }), ...patch } }));
  const selection = useMemo(
    () =>
      addons
        .map((a) => {
          const pick = picks[a.id] ?? { quantity: 0, note: "" };
          return { addon_id: a.id, quantity: pick.quantity, note: pick.note.trim() || null };
        })
        .filter((a) => a.quantity > 0),
    [addons, picks]
  );
  // Notes don't change the price — re-quote only when quantities do.
  const quantitiesKey = selection.map((a) => `${a.addon_id}:${a.quantity}`).join(",");

  const type = types.find((t) => t.id === form.room_type_id) ?? null;
  const bedOptions = cleanBedOptions(type?.bed_options);
  const bedChoice: BedType | null = bedOptions.length > 0 ? (bedOptions.includes(form.bed_preference as BedType) ? (form.bed_preference as BedType) : bedOptions[0]) : null;
  const nights = nightsBetween(form.check_in, form.check_out);
  const datesOk = nights > 0;

  // Live quote (debounced) whenever the price inputs change.
  useEffect(() => {
    if (!form.room_type_id || !datesOk) {
      setQuote(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void quotePreview({
        roomTypeId: form.room_type_id,
        checkIn: form.check_in,
        checkOut: form.check_out,
        adults: form.adults,
        children: form.children,
        promoCode: form.promo_code || null,
        addons: quantitiesKey
          ? quantitiesKey.split(",").map((pair) => {
              const [addon_id, qty] = pair.split(":");
              return { addon_id, quantity: Number(qty) };
            })
          : [],
      }).then((r) => {
        if (!alive) return;
        if (r.ok) {
          setQuote(r.data);
          setQuoteError(null);
        } else {
          setQuote(null);
          setQuoteError(r.error);
        }
      });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [form.room_type_id, form.check_in, form.check_out, form.adults, form.children, form.promo_code, datesOk, quantitiesKey]);

  // Free rooms for the chosen type + dates.
  useEffect(() => {
    if (!form.room_type_id || !datesOk) {
      setRooms(null);
      return;
    }
    let alive = true;
    void freeRooms({ roomTypeId: form.room_type_id, checkIn: form.check_in, checkOut: form.check_out }).then((r) => {
      if (!alive) return;
      setRooms(r.ok ? r.data : []);
      if (r.ok && form.room_id && !r.data.some((x) => x.id === form.room_id)) set("room_id", "");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.room_type_id, form.check_in, form.check_out, datesOk]);

  const phone = useMemo(() => normalizePhone(`${form.country}${form.local}`), [form.country, form.local]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.guest_name.trim()) return setError(STR.errGuest[lang]);
    if (!phone) return setError(STR.errPhone[lang]);
    if (!datesOk) return setError(STR.errDates[lang]);
    start(async () => {
      const r = await createStaffBooking({
        room_type_id: form.room_type_id,
        check_in: form.check_in,
        check_out: form.check_out,
        adults: form.adults,
        children: form.children,
        guest_name: form.guest_name.trim(),
        guest_phone: phone,
        guest_email: form.guest_email.trim() || null,
        nationality: form.nationality.trim() || null,
        preferred_lang: form.preferred_lang,
        source: form.source,
        status: form.status,
        room_id: form.room_id || null,
        promo_code: form.promo_code.trim() || null,
        special_requests: form.special_requests.trim() || null,
        internal_notes: form.internal_notes.trim() || null,
        bed_preference: bedChoice,
        addons: selection,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/reservations/${r.data.id}`);
    });
  }

  const overCapacity = type ? form.adults > type.max_adults || form.children > type.max_children : false;

  return (
    <div>
      <Link href="/reservations" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-maroon-500 hover:text-maroon-800">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {STR.back[lang]}
      </Link>
      <PageHeader title={STR.title[lang]} subtitle={STR.subtitle[lang]} />

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Stay */}
          <Card>
            <CardHeader>
              <CardTitle>{STR.stay[lang]}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="n-type">{COMMON.roomType[lang]}</Label>
                <Select id="n-type" value={form.room_type_id} onChange={(e) => set("room_type_id", e.target.value)} required>
                  {types.map((t) => (
                    <option key={t.id} value={t.id} disabled={!t.is_active}>
                      {localName(t, lang)} · {fmtMoney(t.base_rate_omr, lang)}
                      {!t.is_active ? ` (${COMMON.inactive[lang]})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="n-in">{COMMON.checkIn[lang]}</Label>
                <Input id="n-in" type="date" value={form.check_in} onChange={(e) => set("check_in", e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="n-out">{COMMON.checkOut[lang]}</Label>
                <Input id="n-out" type="date" value={form.check_out} min={form.check_in} onChange={(e) => set("check_out", e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="n-adults">{COMMON.adults[lang]}</Label>
                <Input id="n-adults" type="number" min={1} max={20} value={form.adults} onChange={(e) => set("adults", parseInt(e.target.value, 10) || 1)} />
              </div>
              <div>
                <Label htmlFor="n-children">{COMMON.children[lang]}</Label>
                <Input id="n-children" type="number" min={0} max={20} value={form.children} onChange={(e) => set("children", parseInt(e.target.value, 10) || 0)} />
              </div>
              {bedOptions.length > 1 && (
                <div className="sm:col-span-2">
                  <Label htmlFor="n-bed">{STR.bedPreference[lang]}</Label>
                  <Select id="n-bed" value={bedChoice ?? ""} onChange={(e) => set("bed_preference", asBedType(e.target.value) ?? "")}>
                    {bedOptions.map((bed) => (
                      <option key={bed} value={bed}>
                        {bedLabel(bed, lang)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor="n-room">{STR.roomOptional[lang]}</Label>
                <Select id="n-room" value={form.room_id} onChange={(e) => set("room_id", e.target.value)} disabled={rooms === null}>
                  <option value="">{rooms === null ? COMMON.loading[lang] : STR.noRoom[lang]}</option>
                  {sortRoomsForBed(rooms ?? [], bedChoice).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_number}
                      {r.floor ? ` · ${r.floor}` : ""}
                      {asBedType(r.bed_type) ? ` · ${bedLabel(asBedType(r.bed_type)!, lang)}` : ""}
                    </option>
                  ))}
                </Select>
                {rooms !== null && rooms.length === 0 && datesOk && <p className="mt-1 text-xs text-crimson-700">{STR.noFreeRooms[lang]}</p>}
              </div>
              {overCapacity && <p className="text-xs text-gold-800 sm:col-span-2">{STR.overCapacity[lang]}</p>}
            </CardContent>
          </Card>

          {/* Guest */}
          <Card>
            <CardHeader>
              <CardTitle>{STR.guest[lang]}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="n-name">{STR.guestName[lang]}</Label>
                <Input id="n-name" value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} required autoFocus />
              </div>
              <div>
                <Label htmlFor="n-country">{STR.countryCode[lang]}</Label>
                <Select id="n-country" value={form.country} onChange={(e) => set("country", e.target.value)}>
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.iso} value={c.code}>
                      {c.flag} {c[lang]} ({c.code})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="n-local">{STR.localNumber[lang]}</Label>
                <Input id="n-local" dir="ltr" inputMode="tel" value={form.local} onChange={(e) => set("local", e.target.value)} placeholder="9XXXXXXX" required />
                {form.local && !phone && <p className="mt-1 text-xs text-crimson-700">{STR.errPhone[lang]}</p>}
              </div>
              <div>
                <Label htmlFor="n-email">{COMMON.email[lang]}</Label>
                <Input id="n-email" type="email" dir="ltr" value={form.guest_email} onChange={(e) => set("guest_email", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="n-nat">{COMMON.nationality[lang]}</Label>
                <Input id="n-nat" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="n-lang">{STR.preferredLang[lang]}</Label>
                <Select
                  id="n-lang"
                  value={form.preferred_lang}
                  onChange={(e) => {
                    setLangTouched(true);
                    set("preferred_lang", e.target.value === "ar" ? "ar" : "en");
                  }}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>{STR.details[lang]}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="n-source">{COMMON.source[lang]}</Label>
                <Select id="n-source" value={form.source} onChange={(e) => set("source", e.target.value as (typeof STAFF_SOURCES)[number])}>
                  {STAFF_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {sourceLabel(s, lang)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="n-status">{COMMON.status[lang]}</Label>
                <Select id="n-status" value={form.status} onChange={(e) => set("status", e.target.value === "pending" ? "pending" : "confirmed")}>
                  <option value="confirmed">{STR.confirmed[lang]}</option>
                  <option value="pending">{STR.pending[lang]}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="n-promo">{STR.promo[lang]}</Label>
                <Input id="n-promo" dir="ltr" value={form.promo_code} onChange={(e) => set("promo_code", e.target.value.toUpperCase())} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="n-req">{STR.requests[lang]}</Label>
                <Textarea id="n-req" rows={2} value={form.special_requests} onChange={(e) => set("special_requests", e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="n-notes">{STR.internal[lang]}</Label>
                <Textarea id="n-notes" rows={2} value={form.internal_notes} onChange={(e) => set("internal_notes", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Add-ons */}
          {addons.length > 0 && (
            <Card data-testid="new-booking-addons">
              <CardHeader>
                <CardTitle>{STR.addons[lang]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-maroon-400">{STR.addonsHint[lang]}</p>
                <ul className="divide-y divide-maroon-100">
                  {addons.map((a) => {
                    const pick = pickOf(a.id);
                    const hint = lang === "ar" ? a.note_hint_ar : a.note_hint_en;
                    return (
                      <li key={a.id} data-testid={`addon-${a.slug}`} className="space-y-2 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <AddonIcon kind={a.kind} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-maroon-900">{localName(a, lang)}</p>
                            <p className="text-xs text-maroon-500">
                              {fmtMoney(a.price_omr, lang)} {addonUnitLabel(a.unit, lang)} · {STR.max[lang]} {a.max_quantity}
                            </p>
                          </div>
                          <div className="inline-flex items-center rounded-lg border border-maroon-200 bg-white" role="group" aria-label={localName(a, lang)}>
                            <button
                              type="button"
                              aria-label={`${STR.decrease[lang]} — ${localName(a, lang)}`}
                              disabled={pick.quantity <= 0}
                              onClick={() => setPick(a.id, { quantity: Math.max(0, pick.quantity - 1) })}
                              className="flex h-9 w-9 items-center justify-center text-maroon-700 hover:bg-maroon-50 disabled:opacity-40"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span data-testid={`addon-qty-${a.slug}`} className="w-8 text-center text-sm font-bold text-maroon-900" aria-live="polite">
                              {pick.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`${STR.increase[lang]} — ${localName(a, lang)}`}
                              disabled={pick.quantity >= a.max_quantity}
                              onClick={() => setPick(a.id, { quantity: Math.min(a.max_quantity, pick.quantity + 1) })}
                              className="flex h-9 w-9 items-center justify-center text-maroon-700 hover:bg-maroon-50 disabled:opacity-40"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {pick.quantity > 0 && (
                          <div>
                            <Label htmlFor={`n-addon-note-${a.slug}`} className="text-xs">
                              {STR.addonNote[lang]}
                              {hint ? <span className="font-normal text-maroon-400"> — {hint}</span> : null}
                            </Label>
                            <Input id={`n-addon-note-${a.slug}`} value={pick.note} onChange={(e) => setPick(a.id, { note: e.target.value })} placeholder={hint ?? undefined} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quote */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold-600" />
              <CardTitle>{STR.quote[lang]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xs text-maroon-400">{STR.quoteHint[lang]}</p>
              {!datesOk ? (
                <p className="text-crimson-700">{STR.errDates[lang]}</p>
              ) : quoteError ? (
                <InlineAlert kind="error" message={quoteError} />
              ) : !quote ? (
                <p className="text-maroon-400">{COMMON.loading[lang]}</p>
              ) : (
                <>
                  <p className="text-xs text-maroon-500">
                    {fmtDate(quote.check_in, lang)} → {fmtDate(quote.check_out, lang)} · {nightsLabel(quote.nights, lang)}
                  </p>
                  <p className={quote.available_count > 0 ? "text-xs font-semibold text-jabal-700" : "text-xs font-semibold text-crimson-700"}>
                    {quote.available_count > 0 ? `${quote.available_count} ${STR.available[lang]}` : STR.soldOut[lang]}
                  </p>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-maroon-500">
                    {quote.nightly.map((n) => (
                      <span key={n.date}>
                        {n.date.slice(5)}: {fmtMoney(n.rate, lang)}
                      </span>
                    ))}
                  </div>
                  <dl className="space-y-1 border-t border-maroon-100 pt-2">
                    <div className="flex justify-between">
                      <dt className="text-maroon-500">{STR.subtotal[lang]}</dt>
                      <dd>{fmtMoney(quote.room_subtotal, lang)}</dd>
                    </div>
                    {form.promo_code && !quote.promo_valid && <p className="text-xs text-crimson-700">{STR.promoInvalid[lang]}</p>}
                    {quote.discount > 0 && (
                      <div className="flex justify-between text-jabal-700">
                        <dt>
                          {STR.discount[lang]} ({quote.discount_pct}%)
                        </dt>
                        <dd>− {fmtMoney(quote.discount, lang)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-maroon-500">{STR.service[lang]}</dt>
                      <dd>{fmtMoney(quote.service_charge, lang)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-maroon-500">{STR.tourism[lang]}</dt>
                      <dd>{fmtMoney(quote.tourism_fee, lang)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-maroon-500">{STR.vat[lang]}</dt>
                      <dd>{fmtMoney(quote.vat, lang)}</dd>
                    </div>
                    {quote.addons.length > 0 && (
                      <div className="border-t border-maroon-100 pt-1" data-testid="quote-addons">
                        {quote.addons.map((a) => (
                          <div key={a.addon_id} className="flex justify-between text-xs">
                            <dt className="text-maroon-500">
                              {lang === "ar" ? a.name_ar : a.name_en} ×{a.quantity}
                            </dt>
                            <dd>{fmtMoney(a.total, lang)}</dd>
                          </div>
                        ))}
                        <div className="flex justify-between">
                          <dt className="text-maroon-500">{STR.addonsTotal[lang]}</dt>
                          <dd>{fmtMoney(quote.addons_total, lang)}</dd>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-maroon-200 pt-1 text-lg font-extrabold text-maroon-900">
                      <dt>{COMMON.total[lang]}</dt>
                      <dd>{fmtMoney(quote.total, lang)}</dd>
                    </div>
                  </dl>
                  <p className="text-[11px] text-maroon-400">{STR.payAtHotel[lang]}</p>
                </>
              )}
            </CardContent>
          </Card>
          <InlineAlert kind="error" message={error} />
          <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!datesOk}>
            {STR.create[lang]}
          </Button>
        </div>
      </form>
    </div>
  );
}
