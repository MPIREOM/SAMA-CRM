"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, LogIn, LogOut, XCircle } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { nightsBetween } from "@/lib/booking-engine/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  assignRoom,
  cancelBookingAction,
  checkInBooking,
  checkOutBooking,
  freeRooms,
  type FreeRoom,
} from "@/app/(crm)/(app)/reservations/actions";
import { InlineAlert } from "../load-error";
import { fmtDate, fmtMoney, localName, sourceLabel, statusLabel, statusVariant, nightsLabel } from "../shared";
import type { CalendarBooking, CalendarRoom, CalendarRoomType } from "./layout";

const STR = {
  stay: { en: "Stay", ar: "الإقامة" },
  guests: { en: "Guests", ar: "النزلاء" },
  moveTo: { en: "Room / move to", ar: "الغرفة / نقل إلى" },
  noRoom: { en: "— no room —", ar: "— بدون غرفة —" },
  noFree: { en: "No free rooms of this type for these dates", ar: "لا توجد غرف متاحة من هذا النوع لهذه التواريخ" },
  assign: { en: "Assign", ar: "تخصيص" },
  checkIn: { en: "Check in", ar: "تسجيل وصول" },
  checkOut: { en: "Check out", ar: "تسجيل مغادرة" },
  cancelBooking: { en: "Cancel booking", ar: "إلغاء الحجز" },
  cancelReason: { en: "Reason for cancellation", ar: "سبب الإلغاء" },
  confirmCancel: { en: "Yes, cancel it", ar: "نعم، ألغِ الحجز" },
  keep: { en: "Keep booking", ar: "إبقاء الحجز" },
  needsRoom: { en: "Assign a room to check in", ar: "خصّص غرفة لتسجيل الوصول" },
  requests: { en: "Special requests", ar: "طلبات خاصة" },
  internal: { en: "Internal notes", ar: "ملاحظات داخلية" },
  done: { en: "Done", ar: "تم" },
} satisfies Strings;

interface Props {
  booking: CalendarBooking | null;
  rooms: CalendarRoom[];
  types: CalendarRoomType[];
  today: string;
  onClose: () => void;
}

export function BookingDrawer({ booking, rooms, types, today, onClose }: Props) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [free, setFree] = useState<FreeRoom[] | null>(null);
  const [roomChoice, setRoomChoice] = useState<string>("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const bookingId = booking?.id ?? null;
  const roomTypeId = booking?.room_type_id ?? null;
  const checkIn = booking?.check_in ?? null;
  const checkOut = booking?.check_out ?? null;

  // Fresh list of free rooms (re-checked on the server, not just the visible window).
  useEffect(() => {
    setError(null);
    setNotice(null);
    setCancelling(false);
    setReason("");
    setRoomChoice(booking?.room_id ?? "");
    setFree(null);
    if (!bookingId || !roomTypeId || !checkIn || !checkOut) return;
    let alive = true;
    void freeRooms({ roomTypeId, checkIn, checkOut, excludeBookingId: bookingId }).then((r) => {
      if (!alive) return;
      if (r.ok) setFree(r.data);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, roomTypeId, checkIn, checkOut]);

  const run = useCallback(
    (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, successNotice?: string) => {
      setError(null);
      setNotice(null);
      start(async () => {
        const r = await fn();
        if (!r.ok) {
          setError(r.error);
          return;
        }
        if (successNotice) setNotice(successNotice);
        router.refresh();
      });
    },
    [router]
  );

  if (!booking) return null;

  const type = types.find((t) => t.id === booking.room_type_id) ?? null;
  const currentRoom = rooms.find((r) => r.id === booking.room_id) ?? null;
  const nights = nightsBetween(booking.check_in, booking.check_out);
  const canCheckIn = (booking.status === "confirmed" || booking.status === "pending") && booking.check_in <= today;
  const canCheckOut = booking.status === "checked_in";
  const canCancel = booking.status === "confirmed" || booking.status === "pending" || booking.status === "checked_in";
  const canMove = booking.status !== "checked_out";

  // Include the current room in the list even when it is "busy" with this very booking.
  const options: FreeRoom[] = [...(free ?? [])];
  if (currentRoom && !options.some((r) => r.id === currentRoom.id)) {
    options.unshift({ id: currentRoom.id, room_number: currentRoom.room_number, floor: currentRoom.floor });
  }
  options.sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));

  return (
    <Drawer
      open
      onClose={onClose}
      title={booking.guest_name}
      subtitle={`${booking.ref} · ${localName(type, lang)}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/reservations/${booking.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-maroon-700 hover:text-maroon-900"
          >
            <ExternalLink className="h-4 w-4" />
            {COMMON.openFullPage[lang]}
          </Link>
          <Button variant="outline" size="sm" onClick={onClose}>
            {COMMON.close[lang]}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(booking.status)}>{statusLabel(booking.status, lang)}</Badge>
          <Badge variant="outline">{sourceLabel(booking.source, lang)}</Badge>
          <span className="ms-auto text-sm font-bold text-maroon-900">{fmtMoney(booking.total_omr, lang)}</span>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt className="text-maroon-400">{STR.stay[lang]}</dt>
          <dd className="font-semibold text-maroon-900">
            {fmtDate(booking.check_in, lang)} → {fmtDate(booking.check_out, lang)}
            <span className="ms-1 text-xs font-normal text-maroon-400">
              ({nightsLabel(nights, lang)})
            </span>
          </dd>
          <dt className="text-maroon-400">{STR.guests[lang]}</dt>
          <dd className="font-semibold text-maroon-900">
            {booking.adults} {COMMON.adults[lang]}
            {booking.children > 0 && ` · ${booking.children} ${COMMON.children[lang]}`}
          </dd>
          <dt className="text-maroon-400">{COMMON.phone[lang]}</dt>
          <dd className="font-semibold text-maroon-900" dir="ltr">
            {booking.guest_phone}
          </dd>
          <dt className="text-maroon-400">{COMMON.room[lang]}</dt>
          <dd className="font-semibold text-maroon-900">{currentRoom?.room_number ?? COMMON.unassigned[lang]}</dd>
        </dl>

        {booking.special_requests && (
          <div className="rounded-lg bg-gold-50 px-3 py-2 text-xs text-maroon-800">
            <p className="mb-0.5 font-bold text-gold-800">{STR.requests[lang]}</p>
            {booking.special_requests}
          </div>
        )}
        {booking.internal_notes && (
          <div className="rounded-lg bg-maroon-50 px-3 py-2 text-xs text-maroon-800">
            <p className="mb-0.5 font-bold text-maroon-500">{STR.internal[lang]}</p>
            {booking.internal_notes}
          </div>
        )}

        <InlineAlert kind="error" message={error} />
        <InlineAlert kind="success" message={notice} />

        {canMove && (
          <div>
            <Label htmlFor="drawer-room">{STR.moveTo[lang]}</Label>
            <div className="flex gap-2">
              <Select id="drawer-room" value={roomChoice} onChange={(e) => setRoomChoice(e.target.value)} disabled={pending || free === null}>
                <option value="">{free === null ? COMMON.loading[lang] : STR.noRoom[lang]}</option>
                {options.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room_number}
                    {r.floor ? ` · ${r.floor}` : ""}
                  </option>
                ))}
              </Select>
              <Button
                size="md"
                loading={pending}
                disabled={free === null || roomChoice === (booking.room_id ?? "")}
                onClick={() => run(() => assignRoom({ bookingId: booking.id, roomId: roomChoice || null }), STR.done[lang])}
              >
                {STR.assign[lang]}
              </Button>
            </div>
            {free !== null && free.length === 0 && !currentRoom && (
              <p className="mt-1 text-xs text-crimson-700">{STR.noFree[lang]}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {canCheckIn && (
            <Button
              variant="gold"
              loading={pending}
              disabled={!booking.room_id}
              title={!booking.room_id ? STR.needsRoom[lang] : undefined}
              onClick={() => run(() => checkInBooking({ bookingId: booking.id }), STR.done[lang])}
            >
              <LogIn className="h-4 w-4" />
              {STR.checkIn[lang]}
            </Button>
          )}
          {canCheckOut && (
            <Button
              variant="primary"
              loading={pending}
              onClick={() => run(() => checkOutBooking({ bookingId: booking.id }), STR.done[lang])}
            >
              <LogOut className="h-4 w-4" />
              {STR.checkOut[lang]}
            </Button>
          )}
          {canCancel && !cancelling && (
            <Button variant="outline" className="text-crimson-700" disabled={pending} onClick={() => setCancelling(true)}>
              <XCircle className="h-4 w-4" />
              {STR.cancelBooking[lang]}
            </Button>
          )}
        </div>
        {canCheckIn && !booking.room_id && <p className="text-xs text-maroon-400">{STR.needsRoom[lang]}</p>}

        {cancelling && (
          <div className="space-y-2 rounded-lg border border-crimson-200 bg-crimson-50 p-3">
            <Label htmlFor="drawer-cancel-reason">{STR.cancelReason[lang]}</Label>
            <Textarea id="drawer-cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={pending}
                onClick={() =>
                  run(async () => {
                    const r = await cancelBookingAction({ bookingId: booking.id, reason });
                    if (r.ok) setCancelling(false);
                    return r;
                  }, STR.done[lang])
                }
              >
                {STR.confirmCancel[lang]}
              </Button>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setCancelling(false)}>
                {STR.keep[lang]}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
