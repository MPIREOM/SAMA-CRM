"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  UserX,
  XCircle,
} from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkAuditLog, BkMessageLog, BkScheduledMessage, Role } from "@/lib/database.types";
import type { BookingWithRelations } from "@/lib/bk/bookings";
import { nightsBetween } from "@/lib/booking-engine/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  assignRoom,
  cancelBookingAction,
  changeDates,
  checkInBooking,
  checkOutBooking,
  confirmBooking,
  freeRooms,
  markNoShow,
  resendConfirmation,
  updateGuest,
  type FreeRoom,
} from "@/app/(crm)/(app)/reservations/actions";
import { InlineAlert } from "../load-error";
import { BookingAddonsCard, type AddonOption, type BookingAddonLine } from "./booking-addons";
import {
  channelLabel,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  kindLabel,
  localName,
  scheduledStatusLabel,
  scheduledStatusVariant,
  sourceLabel,
  statusLabel,
  statusVariant,
  nightsLabel,
} from "../shared";

const STR = {
  back: { en: "All reservations", ar: "كل الحجوزات" },
  guestBlock: { en: "Guest", ar: "النزيل" },
  stayBlock: { en: "Stay & price", ar: "الإقامة والسعر" },
  messagesBlock: { en: "Messages", ar: "الرسائل" },
  historyBlock: { en: "History", ar: "السجل" },
  preferredLang: { en: "Preferred language", ar: "اللغة المفضلة" },
  requests: { en: "Special requests", ar: "طلبات خاصة" },
  internal: { en: "Internal notes (staff only)", ar: "ملاحظات داخلية (للموظفين)" },
  saveGuest: { en: "Save guest", ar: "حفظ بيانات النزيل" },
  saveDates: { en: "Update stay", ar: "تحديث الإقامة" },
  datesHint: { en: "Availability is re-checked and the price recalculated.", ar: "يُعاد التحقق من التوفر ويُعاد احتساب السعر." },
  roomAssign: { en: "Assigned room", ar: "الغرفة المخصصة" },
  noRoom: { en: "— not assigned —", ar: "— غير مخصص —" },
  assign: { en: "Assign", ar: "تخصيص" },
  confirm: { en: "Confirm booking", ar: "تأكيد الحجز" },
  checkIn: { en: "Check in", ar: "تسجيل وصول" },
  checkOut: { en: "Check out", ar: "تسجيل مغادرة" },
  noShow: { en: "No-show", ar: "لم يحضر" },
  cancelBooking: { en: "Cancel booking", ar: "إلغاء الحجز" },
  cancelTitle: { en: "Cancel this booking?", ar: "إلغاء هذا الحجز؟" },
  cancelReason: { en: "Reason (shown in the audit log)", ar: "السبب (يظهر في سجل التدقيق)" },
  confirmCancel: { en: "Yes, cancel", ar: "نعم، إلغاء" },
  keep: { en: "Keep", ar: "إبقاء" },
  nightly: { en: "Nightly rates", ar: "أسعار الليالي" },
  subtotal: { en: "Room subtotal", ar: "إجمالي الغرفة" },
  discount: { en: "Discount", ar: "الخصم" },
  service: { en: "Service charge", ar: "رسوم الخدمة" },
  tourism: { en: "Tourism fee", ar: "رسوم السياحة" },
  vat: { en: "VAT", ar: "ضريبة القيمة المضافة" },
  payAtHotel: { en: "Pay at the hotel", ar: "الدفع في الفندق" },
  resendEmail: { en: "Resend confirmation (email)", ar: "إعادة إرسال التأكيد (بريد)" },
  resendWa: { en: "Resend confirmation (WhatsApp)", ar: "إعادة إرسال التأكيد (واتساب)" },
  queued: { en: "Queued — the dispatcher sends it within minutes.", ar: "في قائمة الانتظار — سيُرسل خلال دقائق." },
  scheduled: { en: "Scheduled", ar: "المجدولة" },
  sendLog: { en: "Send log", ar: "سجل الإرسال" },
  noMessages: { en: "No messages yet", ar: "لا توجد رسائل بعد" },
  attempts: { en: "attempts", ar: "محاولات" },
  contact: { en: "CRM contact", ar: "جهة الاتصال" },
  cancelledOn: { en: "Cancelled", ar: "أُلغي" },
  createdOn: { en: "Created", ar: "أُنشئ" },
  checkedInAt: { en: "Checked in", ar: "سجّل الوصول" },
  checkedOutAt: { en: "Checked out", ar: "سجّل المغادرة" },
  saved: { en: "Saved", ar: "تم الحفظ" },
  needsRoom: { en: "Assign a room before checking in.", ar: "خصّص غرفة قبل تسجيل الوصول." },
  promo: { en: "Promo code", ar: "رمز الخصم" },
  addons: { en: "Add-ons", ar: "الإضافات" },
} satisfies Strings;

type Money = Pick<
  BookingWithRelations,
  "room_subtotal_omr" | "discount_omr" | "service_charge_omr" | "tourism_fee_omr" | "vat_omr" | "total_omr" | "addons_omr"
>;

type BookingProps = Omit<BookingWithRelations, keyof Money | "addons"> & { [K in keyof Money]: number } & { addons: BookingAddonLine[] };

interface Props {
  booking: BookingProps;
  /** Active add-ons for the "Add add-on" control. */
  catalogue: AddonOption[];
  scheduled: BkScheduledMessage[];
  log: BkMessageLog[];
  auditRows: Pick<BkAuditLog, "id" | "action" | "actor_email" | "created_at" | "diff">[];
  today: string;
  role: Role;
}

type Result = { ok: true } | { ok: false; error: string };

export function BookingDetail({ booking, catalogue, scheduled, log, auditRows, today }: Props) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Guest form
  const [guest, setGuest] = useState({
    guest_name: booking.guest_name,
    guest_email: booking.guest_email ?? "",
    guest_phone: booking.guest_phone,
    nationality: booking.nationality ?? "",
    preferred_lang: booking.preferred_lang === "ar" ? "ar" : "en",
    special_requests: booking.special_requests ?? "",
    internal_notes: booking.internal_notes ?? "",
  });
  // Stay form
  const [stay, setStay] = useState({
    check_in: booking.check_in,
    check_out: booking.check_out,
    adults: booking.adults,
    children: booking.children,
  });
  const [roomChoice, setRoomChoice] = useState(booking.room_id ?? "");
  const [free, setFree] = useState<FreeRoom[] | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setGuest({
      guest_name: booking.guest_name,
      guest_email: booking.guest_email ?? "",
      guest_phone: booking.guest_phone,
      nationality: booking.nationality ?? "",
      preferred_lang: booking.preferred_lang === "ar" ? "ar" : "en",
      special_requests: booking.special_requests ?? "",
      internal_notes: booking.internal_notes ?? "",
    });
    setStay({ check_in: booking.check_in, check_out: booking.check_out, adults: booking.adults, children: booking.children });
    setRoomChoice(booking.room_id ?? "");
  }, [booking]);

  const live = booking.status !== "cancelled" && booking.status !== "no_show" && booking.status !== "checked_out";

  useEffect(() => {
    if (!live) return;
    let alive = true;
    void freeRooms({
      roomTypeId: booking.room_type_id,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      excludeBookingId: booking.id,
    }).then((r) => {
      if (alive && r.ok) setFree(r.data);
    });
    return () => {
      alive = false;
    };
  }, [booking.id, booking.room_type_id, booking.check_in, booking.check_out, live]);

  function run(fn: () => Promise<Result>, success = STR.saved[lang]) {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNotice(success);
      router.refresh();
    });
  }

  function saveGuest(e: FormEvent) {
    e.preventDefault();
    run(() =>
      updateGuest({
        bookingId: booking.id,
        guest_name: guest.guest_name,
        guest_email: guest.guest_email || null,
        guest_phone: guest.guest_phone,
        nationality: guest.nationality || null,
        preferred_lang: guest.preferred_lang,
        special_requests: guest.special_requests || null,
        internal_notes: guest.internal_notes || null,
      })
    );
  }

  function saveStay(e: FormEvent) {
    e.preventDefault();
    run(() => changeDates({ bookingId: booking.id, ...stay }));
  }

  const nights = nightsBetween(booking.check_in, booking.check_out);
  const nightly = Array.isArray(booking.nightly_rates)
    ? (booking.nightly_rates as { date?: string; rate?: number | string }[])
    : [];
  const roomOptions: FreeRoom[] = [...(free ?? [])];
  if (booking.room && !roomOptions.some((r) => r.id === booking.room?.id)) {
    roomOptions.unshift({ id: booking.room.id, room_number: booking.room.room_number, floor: booking.room.floor });
  }
  roomOptions.sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));

  const canConfirm = booking.status === "pending";
  const canCheckIn = (booking.status === "confirmed" || booking.status === "pending") && booking.check_in <= today;
  const canCheckOut = booking.status === "checked_in";
  const canNoShow = (booking.status === "confirmed" || booking.status === "pending") && booking.check_in <= today;
  const canCancel = booking.status === "confirmed" || booking.status === "pending" || booking.status === "checked_in";

  return (
    <div>
      <Link href="/reservations" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-maroon-500 hover:text-maroon-800">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {STR.back[lang]}
      </Link>
      <PageHeader
        title={`${booking.ref} · ${booking.guest_name}`}
        subtitle={`${localName(booking.room_type, lang)} · ${fmtDate(booking.check_in, lang)} → ${fmtDate(booking.check_out, lang)} · ${nightsLabel(nights, lang)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(booking.status)} className="text-sm">
              {statusLabel(booking.status, lang)}
            </Badge>
            <Badge variant="outline">{sourceLabel(booking.source, lang)}</Badge>
          </div>
        }
      />

      <div className="mb-4 space-y-2">
        <InlineAlert kind="error" message={error} />
        <InlineAlert kind="success" message={notice} />
      </div>

      {/* Status actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        {canConfirm && (
          <Button variant="gold" loading={pending} onClick={() => run(() => confirmBooking({ bookingId: booking.id }))}>
            <CheckCircle2 className="h-4 w-4" />
            {STR.confirm[lang]}
          </Button>
        )}
        {canCheckIn && (
          <Button
            loading={pending}
            disabled={!booking.room_id}
            title={!booking.room_id ? STR.needsRoom[lang] : undefined}
            onClick={() => run(() => checkInBooking({ bookingId: booking.id }))}
          >
            <LogIn className="h-4 w-4" />
            {STR.checkIn[lang]}
          </Button>
        )}
        {canCheckOut && (
          <Button loading={pending} onClick={() => run(() => checkOutBooking({ bookingId: booking.id }))}>
            <LogOut className="h-4 w-4" />
            {STR.checkOut[lang]}
          </Button>
        )}
        {canNoShow && (
          <Button variant="outline" loading={pending} onClick={() => run(() => markNoShow({ bookingId: booking.id }))}>
            <UserX className="h-4 w-4" />
            {STR.noShow[lang]}
          </Button>
        )}
        {canCancel && (
          <Button variant="outline" className="text-crimson-700" disabled={pending} onClick={() => setCancelOpen(true)}>
            <XCircle className="h-4 w-4" />
            {STR.cancelBooking[lang]}
          </Button>
        )}
        {canCheckIn && !booking.room_id && <p className="self-center text-xs text-maroon-400">{STR.needsRoom[lang]}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Guest */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>{STR.guestBlock[lang]}</CardTitle>
            {booking.contact_id && (
              <Link href={`/contacts/${booking.contact_id}`} className="text-xs font-semibold text-maroon-500 hover:underline">
                {STR.contact[lang]} →
              </Link>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={saveGuest} className="space-y-3">
              <div>
                <Label htmlFor="g-name">{COMMON.name[lang]}</Label>
                <Input id="g-name" value={guest.guest_name} onChange={(e) => setGuest({ ...guest, guest_name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="g-phone">{COMMON.phone[lang]}</Label>
                  <Input id="g-phone" dir="ltr" value={guest.guest_phone} onChange={(e) => setGuest({ ...guest, guest_phone: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="g-email">{COMMON.email[lang]}</Label>
                  <Input id="g-email" type="email" dir="ltr" value={guest.guest_email} onChange={(e) => setGuest({ ...guest, guest_email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="g-nat">{COMMON.nationality[lang]}</Label>
                  <Input id="g-nat" value={guest.nationality} onChange={(e) => setGuest({ ...guest, nationality: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="g-lang">{STR.preferredLang[lang]}</Label>
                  <Select id="g-lang" value={guest.preferred_lang} onChange={(e) => setGuest({ ...guest, preferred_lang: e.target.value === "ar" ? "ar" : "en" })}>
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="g-req">{STR.requests[lang]}</Label>
                <Textarea id="g-req" rows={2} value={guest.special_requests} onChange={(e) => setGuest({ ...guest, special_requests: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="g-notes">{STR.internal[lang]}</Label>
                <Textarea id="g-notes" rows={2} value={guest.internal_notes} onChange={(e) => setGuest({ ...guest, internal_notes: e.target.value })} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={pending}>
                  {STR.saveGuest[lang]}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Stay & price */}
        <Card>
          <CardHeader>
            <CardTitle>{STR.stayBlock[lang]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={saveStay} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="s-in">{COMMON.checkIn[lang]}</Label>
                  <Input id="s-in" type="date" value={stay.check_in} disabled={!live} onChange={(e) => setStay({ ...stay, check_in: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="s-out">{COMMON.checkOut[lang]}</Label>
                  <Input id="s-out" type="date" value={stay.check_out} disabled={!live} onChange={(e) => setStay({ ...stay, check_out: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="s-adults">{COMMON.adults[lang]}</Label>
                  <Input id="s-adults" type="number" min={1} max={20} value={stay.adults} disabled={!live} onChange={(e) => setStay({ ...stay, adults: parseInt(e.target.value, 10) || 1 })} />
                </div>
                <div>
                  <Label htmlFor="s-children">{COMMON.children[lang]}</Label>
                  <Input id="s-children" type="number" min={0} max={20} value={stay.children} disabled={!live} onChange={(e) => setStay({ ...stay, children: parseInt(e.target.value, 10) || 0 })} />
                </div>
              </div>
              {live && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-maroon-400">{STR.datesHint[lang]}</p>
                  <Button type="submit" variant="outline" loading={pending}>
                    {STR.saveDates[lang]}
                  </Button>
                </div>
              )}
            </form>

            {live && (
              <div>
                <Label htmlFor="s-room">{STR.roomAssign[lang]}</Label>
                <div className="flex gap-2">
                  <Select id="s-room" value={roomChoice} onChange={(e) => setRoomChoice(e.target.value)} disabled={free === null}>
                    <option value="">{free === null ? COMMON.loading[lang] : STR.noRoom[lang]}</option>
                    {roomOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.room_number}
                        {r.floor ? ` · ${r.floor}` : ""}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="outline"
                    loading={pending}
                    disabled={free === null || roomChoice === (booking.room_id ?? "")}
                    onClick={() => run(() => assignRoom({ bookingId: booking.id, roomId: roomChoice || null }))}
                  >
                    {STR.assign[lang]}
                  </Button>
                </div>
              </div>
            )}
            {!live && (
              <p className="text-sm text-maroon-600">
                {COMMON.room[lang]}: <span className="font-semibold">{booking.room?.room_number ?? COMMON.unassigned[lang]}</span>
              </p>
            )}

            <div className="rounded-lg border border-maroon-100 bg-maroon-50/50 p-3 text-sm">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-maroon-400">{STR.nightly[lang]}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-maroon-700">
                {nightly.map((n, i) => (
                  <span key={`${n.date ?? i}`}>
                    {fmtDate(n.date ?? null, lang)}: <span className="font-semibold">{fmtMoney(n.rate ?? 0, lang)}</span>
                  </span>
                ))}
              </div>
              <dl className="mt-3 space-y-1">
                <div className="flex justify-between">
                  <dt className="text-maroon-500">{STR.subtotal[lang]}</dt>
                  <dd>{fmtMoney(booking.room_subtotal_omr, lang)}</dd>
                </div>
                {booking.discount_omr > 0 && (
                  <div className="flex justify-between text-jabal-700">
                    <dt>
                      {STR.discount[lang]}
                      {booking.promo_code ? ` (${booking.promo_code})` : ""}
                    </dt>
                    <dd>− {fmtMoney(booking.discount_omr, lang)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-maroon-500">{STR.service[lang]}</dt>
                  <dd>{fmtMoney(booking.service_charge_omr, lang)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-maroon-500">{STR.tourism[lang]}</dt>
                  <dd>{fmtMoney(booking.tourism_fee_omr, lang)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-maroon-500">{STR.vat[lang]}</dt>
                  <dd>{fmtMoney(booking.vat_omr, lang)}</dd>
                </div>
                {booking.addons_omr > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-maroon-500">{STR.addons[lang]}</dt>
                    <dd data-testid="money-addons">{fmtMoney(booking.addons_omr, lang)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-maroon-200 pt-1 text-base font-extrabold text-maroon-900">
                  <dt>{COMMON.total[lang]}</dt>
                  <dd>{fmtMoney(booking.total_omr, lang)}</dd>
                </div>
              </dl>
              <p className="mt-1 text-[11px] text-maroon-400">{STR.payAtHotel[lang]}</p>
            </div>
          </CardContent>
        </Card>

        {/* Add-ons (APEX Zipline, 4WD transfers) */}
        <BookingAddonsCard
          bookingId={booking.id}
          lines={booking.addons}
          addonsOmr={booking.addons_omr}
          catalogue={catalogue}
          live={live}
          pending={pending}
          run={run}
        />

        {/* Messages */}
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{STR.messagesBlock[lang]}</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                loading={pending}
                disabled={!booking.guest_email}
                onClick={() => run(() => resendConfirmation({ bookingId: booking.id, channel: "email" }), STR.queued[lang])}
              >
                <Mail className="h-4 w-4" />
                {STR.resendEmail[lang]}
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={pending}
                onClick={() => run(() => resendConfirmation({ bookingId: booking.id, channel: "whatsapp" }), STR.queued[lang])}
              >
                <MessageCircle className="h-4 w-4" />
                {STR.resendWa[lang]}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-maroon-400">{STR.scheduled[lang]}</p>
              {scheduled.length === 0 ? (
                <p className="text-maroon-400">{STR.noMessages[lang]}</p>
              ) : (
                <ul className="divide-y divide-maroon-100">
                  {scheduled.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 py-1.5">
                      <span className="font-semibold text-maroon-900">{kindLabel(m.kind, lang)}</span>
                      <span className="text-maroon-400">{channelLabel(m.channel, lang)}</span>
                      <Badge variant={scheduledStatusVariant(m.status)}>{scheduledStatusLabel(m.status, lang)}</Badge>
                      <span className="ms-auto text-xs text-maroon-500">{fmtDateTime(m.sent_at ?? m.send_at, lang)}</span>
                      {m.attempts > 0 && (
                        <span className="text-xs text-maroon-400">
                          {m.attempts} {STR.attempts[lang]}
                        </span>
                      )}
                      {m.last_error && <span className="basis-full text-xs text-crimson-700">{m.last_error}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-maroon-400">{STR.sendLog[lang]}</p>
              {log.length === 0 ? (
                <p className="text-maroon-400">{STR.noMessages[lang]}</p>
              ) : (
                <ul className="divide-y divide-maroon-100">
                  {log.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 py-1.5">
                      <span className="text-xs text-maroon-500">{fmtDateTime(m.created_at, lang)}</span>
                      <span className="font-semibold text-maroon-900">{kindLabel(m.kind, lang)}</span>
                      <span className="text-maroon-400">{channelLabel(m.channel, lang)}</span>
                      <Badge variant={scheduledStatusVariant(m.status)}>{m.status}</Badge>
                      {m.recipient && (
                        <span className="text-xs text-maroon-400" dir="ltr">
                          {m.recipient}
                        </span>
                      )}
                      {m.error && <span className="basis-full text-xs text-crimson-700">{m.error}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle>{STR.historyBlock[lang]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-maroon-400">{STR.createdOn[lang]}</dt>
              <dd className="text-maroon-800">{fmtDateTime(booking.created_at, lang)}</dd>
              {booking.checked_in_at && (
                <>
                  <dt className="text-maroon-400">{STR.checkedInAt[lang]}</dt>
                  <dd className="text-maroon-800">{fmtDateTime(booking.checked_in_at, lang)}</dd>
                </>
              )}
              {booking.checked_out_at && (
                <>
                  <dt className="text-maroon-400">{STR.checkedOutAt[lang]}</dt>
                  <dd className="text-maroon-800">{fmtDateTime(booking.checked_out_at, lang)}</dd>
                </>
              )}
              {booking.cancelled_at && (
                <>
                  <dt className="text-maroon-400">{STR.cancelledOn[lang]}</dt>
                  <dd className="text-maroon-800">
                    {fmtDateTime(booking.cancelled_at, lang)}
                    {booking.cancel_reason ? ` — ${booking.cancel_reason}` : ""}
                  </dd>
                </>
              )}
              {booking.promo_code && (
                <>
                  <dt className="text-maroon-400">{STR.promo[lang]}</dt>
                  <dd className="text-maroon-800">{booking.promo_code}</dd>
                </>
              )}
            </dl>
            {auditRows.length > 0 && (
              <ul className="divide-y divide-maroon-100 border-t border-maroon-100 pt-2">
                {auditRows.map((a) => (
                  <li key={a.id} className="py-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-maroon-900">{a.action}</span>
                      <span className="text-xs text-maroon-400">{a.actor_email ?? "—"}</span>
                      <span className="ms-auto text-xs text-maroon-500">{fmtDateTime(a.created_at, lang)}</span>
                    </div>
                    {a.diff !== null && a.diff !== undefined && (
                      <pre className="mt-1 max-h-24 overflow-auto scrollbar-thin rounded bg-maroon-50 p-2 text-[10px] leading-snug text-maroon-700" dir="ltr">
                        {JSON.stringify(a.diff, null, 1)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={STR.cancelTitle[lang]}>
        <div className="space-y-3">
          <p className="text-sm text-maroon-600">
            {booking.ref} · {booking.guest_name} · {fmtDate(booking.check_in, lang)} → {fmtDate(booking.check_out, lang)}
          </p>
          <div>
            <Label htmlFor="cancel-reason">{STR.cancelReason[lang]}</Label>
            <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={pending}>
              {STR.keep[lang]}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                run(async () => {
                  const r = await cancelBookingAction({ bookingId: booking.id, reason });
                  if (r.ok) setCancelOpen(false);
                  return r;
                })
              }
            >
              {STR.confirmCancel[lang]}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
