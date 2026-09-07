"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { COMMON, type Strings } from "@/lib/i18n";
import { useLang } from "@/components/providers/lang-provider";
import { COUNTRY_CODES, normalizePhone } from "@/lib/phone";
import { generateBookingRef } from "@/lib/utils";
import type { Booking, BookingSource } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import {
  ROOM_TYPES,
  SOURCES,
  sourceLabel,
} from "@/components/bookings/booking-shared";

const STR = {
  title: { en: "New booking", ar: "حجز جديد" },
  subtitle: {
    en: "Create a booking and send the guest a confirmation",
    ar: "أنشئ حجزًا وأرسل تأكيدًا للنزيل",
  },
  backToBookings: { en: "Back to bookings", ar: "العودة إلى الحجوزات" },
  guestName: { en: "Guest name", ar: "اسم النزيل" },
  guestPlaceholder: { en: "e.g. Ahmed Al Balushi", ar: "مثال: أحمد البلوشي" },
  localNumber: { en: "Local number", ar: "الرقم المحلي" },
  otherRoomType: { en: "Room type (custom)", ar: "نوع الغرفة (مخصص)" },
  otherRoomPlaceholder: {
    en: "Type the room type…",
    ar: "اكتب نوع الغرفة…",
  },
  other: { en: "Other…", ar: "أخرى…" },
  confirmationRef: { en: "Confirmation ref", ar: "الرقم المرجعي للتأكيد" },
  refHelp: {
    en: "Auto-generated — replace with the OTA reference if needed.",
    ar: "يُولَّد تلقائيًا — استبدله بمرجع منصة الحجز (OTA) عند الحاجة.",
  },
  regenerate: { en: "Regenerate reference", ar: "توليد مرجع جديد" },
  create: { en: "Create booking", ar: "إنشاء الحجز" },
  errGuest: {
    en: "Please enter the guest name.",
    ar: "يرجى إدخال اسم النزيل.",
  },
  errPhone: {
    en: "Please enter a valid phone number.",
    ar: "يرجى إدخال رقم هاتف صحيح.",
  },
  errCheckIn: {
    en: "Please pick a check-in date.",
    ar: "يرجى اختيار تاريخ الوصول.",
  },
  errCheckOut: {
    en: "Check-out must be after check-in.",
    ar: "يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول.",
  },
  errRoomType: {
    en: "Please enter the room type.",
    ar: "يرجى إدخال نوع الغرفة.",
  },
  errRef: {
    en: "Please enter a confirmation reference.",
    ar: "يرجى إدخال الرقم المرجعي للتأكيد.",
  },
  refExists: {
    en: "This reference already exists — use a different one.",
    ar: "هذا الرقم المرجعي موجود مسبقًا — استخدم رقمًا آخر.",
  },
  successTitle: { en: "Booking created", ar: "تم إنشاء الحجز" },
  successRef: { en: "Confirmation ref", ar: "الرقم المرجعي" },
  confSent: {
    en: "WhatsApp confirmation was sent to the guest.",
    ar: "تم إرسال تأكيد الحجز عبر واتساب إلى النزيل.",
  },
  confFailed: {
    en: "The confirmation message could not be sent",
    ar: "تعذّر إرسال رسالة التأكيد",
  },
  confSkipped: {
    en: "The confirmation was skipped",
    ar: "تم تخطي رسالة التأكيد",
  },
  confNone: {
    en: "No booking-confirmation automation is enabled — no message was sent.",
    ar: "لا توجد أتمتة مفعّلة لتأكيد الحجز — لم تُرسل أي رسالة.",
  },
  addAnother: { en: "Add another", ar: "إضافة حجز آخر" },
  goToBookings: { en: "Go to bookings", ar: "الذهاب إلى الحجوزات" },
} satisfies Strings;

const OTHER = "__other__";

interface Confirmation {
  sent: boolean;
  skipped: boolean;
  reason: string | null;
}

interface SuccessState {
  booking: Booking;
  confirmation: Confirmation | null;
}

function emptyForm() {
  return {
    guest: "",
    countryCode: "+968",
    localNumber: "",
    checkIn: "",
    checkOut: "",
    roomType: ROOM_TYPES[0].value,
    roomTypeOther: "",
    source: "Offline" as BookingSource,
    ref: generateBookingRef(),
  };
}

export default function NewBookingPage() {
  const { lang } = useLang();
  const router = useRouter();

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  function set<K extends keyof ReturnType<typeof emptyForm>>(
    key: K,
    value: ReturnType<typeof emptyForm>[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.guest.trim()) return STR.errGuest[lang];
    const phone = normalizePhone(form.countryCode + form.localNumber);
    if (!form.localNumber.trim() || !phone) return STR.errPhone[lang];
    if (!form.checkIn) return STR.errCheckIn[lang];
    if (!form.checkOut || form.checkOut <= form.checkIn)
      return STR.errCheckOut[lang];
    if (form.roomType === OTHER && !form.roomTypeOther.trim())
      return STR.errRoomType[lang];
    if (!form.ref.trim()) return STR.errRef[lang];
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest: form.guest.trim(),
          phone: normalizePhone(form.countryCode + form.localNumber),
          check_in: form.checkIn,
          check_out: form.checkOut,
          room_type:
            form.roomType === OTHER
              ? form.roomTypeOther.trim()
              : form.roomType,
          source: form.source,
          ref: form.ref.trim(),
        }),
      });

      if (res.status === 409) {
        setError(STR.refExists[lang]);
        return;
      }
      if (!res.ok) {
        setError(COMMON.error[lang]);
        return;
      }
      const data = (await res.json()) as SuccessState;
      setSuccess(data);
    } catch {
      setError(COMMON.error[lang]);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setForm(emptyForm());
    setError(null);
    setSuccess(null);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button
        type="button"
        onClick={() => router.push("/bookings")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-maroon-500 transition-colors hover:text-maroon-800"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {STR.backToBookings[lang]}
      </button>

      <PageHeader title={STR.title[lang]} subtitle={STR.subtitle[lang]} />

      {success ? (
        <Card className="border-jabal-200">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="rounded-full bg-jabal-50 p-4 text-jabal-600">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-jabal-700">
                {STR.successTitle[lang]}
              </h2>
              <p className="mt-2 text-sm text-maroon-500">
                {STR.successRef[lang]}
              </p>
              <p
                dir="ltr"
                className="mt-1 text-2xl font-extrabold tracking-wide text-maroon-900"
              >
                {success.booking.ref}
              </p>
            </div>

            <div
              className={
                success.confirmation?.sent
                  ? "w-full rounded-lg border border-jabal-200 bg-jabal-50 px-4 py-3 text-sm font-semibold text-jabal-700"
                  : "w-full rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm font-semibold text-gold-800"
              }
            >
              {success.confirmation === null ? (
                STR.confNone[lang]
              ) : success.confirmation.sent ? (
                STR.confSent[lang]
              ) : (
                <>
                  {success.confirmation.skipped
                    ? STR.confSkipped[lang]
                    : STR.confFailed[lang]}
                  {success.confirmation.reason && (
                    <span dir="ltr" className="mt-1 block font-mono text-xs font-normal">
                      {success.confirmation.reason}
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" onClick={reset}>
                {STR.addAnother[lang]}
              </Button>
              <Button onClick={() => router.push("/bookings")}>
                {STR.goToBookings[lang]}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Guest name */}
              <div>
                <Label htmlFor="guest">{STR.guestName[lang]} *</Label>
                <Input
                  id="guest"
                  value={form.guest}
                  onChange={(e) => set("guest", e.target.value)}
                  placeholder={STR.guestPlaceholder[lang]}
                  autoFocus
                />
              </div>

              {/* Phone */}
              <div>
                <Label htmlFor="phone">{COMMON.phone[lang]} *</Label>
                <div className="flex gap-2">
                  <Select
                    aria-label={COMMON.phone[lang]}
                    value={form.countryCode}
                    onChange={(e) => set("countryCode", e.target.value)}
                    className="w-44 shrink-0"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.iso} value={c.code}>
                        {c.flag} {c.code} — {c[lang]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    id="phone"
                    dir="ltr"
                    inputMode="tel"
                    value={form.localNumber}
                    onChange={(e) => set("localNumber", e.target.value)}
                    placeholder="91234567"
                    className="ltr:text-left rtl:text-right"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="check_in">{COMMON.checkIn[lang]} *</Label>
                  <Input
                    id="check_in"
                    type="date"
                    value={form.checkIn}
                    onChange={(e) => set("checkIn", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="check_out">{COMMON.checkOut[lang]} *</Label>
                  <Input
                    id="check_out"
                    type="date"
                    min={form.checkIn || undefined}
                    value={form.checkOut}
                    onChange={(e) => set("checkOut", e.target.value)}
                  />
                </div>
              </div>

              {/* Room type + source */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="room_type">{COMMON.roomType[lang]}</Label>
                  <Select
                    id="room_type"
                    value={form.roomType}
                    onChange={(e) => set("roomType", e.target.value)}
                  >
                    {ROOM_TYPES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r[lang]}
                      </option>
                    ))}
                    <option value={OTHER}>{STR.other[lang]}</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="source">{COMMON.source[lang]}</Label>
                  <Select
                    id="source"
                    value={form.source}
                    onChange={(e) =>
                      set("source", e.target.value as BookingSource)
                    }
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {sourceLabel(s, lang)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {form.roomType === OTHER && (
                <div>
                  <Label htmlFor="room_type_other">
                    {STR.otherRoomType[lang]} *
                  </Label>
                  <Input
                    id="room_type_other"
                    value={form.roomTypeOther}
                    onChange={(e) => set("roomTypeOther", e.target.value)}
                    placeholder={STR.otherRoomPlaceholder[lang]}
                  />
                </div>
              )}

              {/* Confirmation ref */}
              <div>
                <Label htmlFor="ref">{STR.confirmationRef[lang]} *</Label>
                <div className="flex gap-2">
                  <Input
                    id="ref"
                    dir="ltr"
                    value={form.ref}
                    onChange={(e) => set("ref", e.target.value)}
                    className="font-mono ltr:text-left rtl:text-right"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => set("ref", generateBookingRef())}
                    title={STR.regenerate[lang]}
                    aria-label={STR.regenerate[lang]}
                    className="w-10 shrink-0 px-0"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-maroon-400">
                  {STR.refHelp[lang]}
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-crimson-200 bg-crimson-50 px-4 py-3 text-sm font-semibold text-crimson-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-maroon-100 pt-5">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push("/bookings")}
                >
                  {COMMON.cancel[lang]}
                </Button>
                <Button type="submit" loading={submitting}>
                  {STR.create[lang]}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
