"use client";

import { Fragment, useMemo } from "react";
import { Wrench } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { blockKindLabel, localName, STATUS_BAR_CLASS, fmtWeekday } from "../shared";
import {
  buildGroups,
  dayRange,
  isWeekend,
  packLanes,
  placeBar,
  type BarPlacement,
  type CalendarBlock,
  type CalendarBooking,
  type CalendarRoom,
  type CalendarRoomType,
} from "./layout";
import type { BkBookingStatus } from "@/lib/database.types";

const STR = {
  unassigned: { en: "Unassigned", ar: "غير مخصص" },
  stopSell: { en: "Stop sell", ar: "إيقاف البيع" },
  inactive: { en: "inactive", ar: "غير نشط" },
  noRooms: { en: "No rooms", ar: "لا توجد غرف" },
  newHere: { en: "New booking or block", ar: "حجز أو إغلاق جديد" },
} satisfies Strings;

export interface CellTarget {
  roomId: string;
  roomTypeId: string;
  roomNumber: string;
  date: string;
}

interface Props {
  from: string;
  days: number;
  today: string;
  types: CalendarRoomType[];
  rooms: CalendarRoom[];
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  selectedId: string | null;
  onSelectBooking: (id: string) => void;
  onSelectCell: (target: CellTarget) => void;
}

const HATCH =
  "repeating-linear-gradient(45deg, rgba(132,66,75,0.28) 0 4px, rgba(243,232,233,0.9) 4px 9px)";

function barStyle(p: BarPlacement): React.CSSProperties {
  return {
    insetInlineStart: `calc(var(--cell) * ${p.left})`,
    width: `calc(var(--cell) * ${p.width})`,
  };
}

function BookingBar({
  booking,
  placement,
  selected,
  onClick,
}: {
  booking: CalendarBooking;
  placement: BarPlacement;
  selected: boolean;
  onClick: () => void;
}) {
  const cls = STATUS_BAR_CLASS[booking.status as BkBookingStatus] ?? "bg-maroon-400 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${booking.ref} · ${booking.guest_name} · ${booking.check_in} → ${booking.check_out}`}
      style={barStyle(placement)}
      className={cn(
        "absolute top-1 z-10 flex h-[calc(100%-0.5rem)] items-center overflow-hidden border px-1.5 text-[11px] font-semibold leading-none shadow-sm transition-shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400",
        cls,
        placement.clippedStart ? "rounded-s-none" : "rounded-s-md",
        placement.clippedEnd ? "rounded-e-none" : "rounded-e-md",
        selected && "ring-2 ring-gold-400 ring-offset-1"
      )}
    >
      <span className="truncate">{booking.guest_name}</span>
    </button>
  );
}

function BlockBar({ block, placement, lang }: { block: CalendarBlock; placement: BarPlacement; lang: "en" | "ar" }) {
  return (
    <div
      title={`${blockKindLabel(block.kind, lang)}${block.reason ? ` · ${block.reason}` : ""} · ${block.start_date} → ${block.end_date}`}
      style={{ ...barStyle(placement), backgroundImage: HATCH }}
      className={cn(
        "absolute top-1 z-[5] flex h-[calc(100%-0.5rem)] items-center overflow-hidden border border-maroon-200 px-1.5 text-[10px] font-semibold text-maroon-600",
        placement.clippedStart ? "rounded-s-none" : "rounded-s-md",
        placement.clippedEnd ? "rounded-e-none" : "rounded-e-md"
      )}
    >
      <span className="truncate">{blockKindLabel(block.kind, lang)}</span>
    </div>
  );
}

/** The day cells behind the bars (weekend / today shading + click targets). */
function DayCells({
  dates,
  today,
  onClick,
  label,
}: {
  dates: string[];
  today: string;
  onClick?: (date: string) => void;
  label?: string;
}) {
  return (
    <>
      {dates.map((d) => {
        const cls = cn(
          "h-full w-[var(--cell)] shrink-0 border-e border-maroon-100/70",
          d === today ? "bg-gold-50" : isWeekend(d) ? "bg-maroon-50/70" : "bg-transparent"
        );
        return onClick ? (
          <button
            key={d}
            type="button"
            aria-label={label ? `${label} ${d}` : d}
            onClick={() => onClick(d)}
            className={cn(cls, "hover:bg-gold-100/70 focus-visible:outline-none focus-visible:bg-gold-100")}
          />
        ) : (
          <div key={d} className={cls} />
        );
      })}
    </>
  );
}

export function TapeChart({
  from,
  days,
  today,
  types,
  rooms,
  bookings,
  blocks,
  selectedId,
  onSelectBooking,
  onSelectCell,
}: Props) {
  const { lang } = useLang();
  const dates = useMemo(() => dayRange(from, days), [from, days]);
  const groups = useMemo(() => buildGroups(types, rooms, bookings, blocks), [types, rooms, bookings, blocks]);
  const trackWidth = `calc(var(--cell) * ${days})`;

  return (
    <div
      className={cn(
        "relative max-h-[calc(100vh-13rem)] overflow-auto scrollbar-thin rounded-xl border border-maroon-100 bg-white shadow-card",
        "[--cell:34px] [--label:84px] sm:[--cell:46px] sm:[--label:124px]"
      )}
    >
      <div className="min-w-max">
        {/* Header */}
        <div className="sticky top-0 z-30 flex border-b border-maroon-200 bg-maroon-50">
          <div className="sticky start-0 z-40 flex w-[var(--label)] shrink-0 items-center border-e border-maroon-200 bg-maroon-50 px-2 text-[11px] font-bold uppercase tracking-wide text-maroon-500">
            {COMMON.room[lang]}
          </div>
          <div className="flex" style={{ width: trackWidth }}>
            {dates.map((d) => {
              const isToday = d === today;
              const weekend = isWeekend(d);
              const showMonth = d.slice(8) === "01" || d === dates[0];
              return (
                <div
                  key={d}
                  className={cn(
                    "flex w-[var(--cell)] shrink-0 flex-col items-center justify-center border-e border-maroon-100 py-1 leading-tight",
                    isToday ? "bg-gold-100 text-maroon-900" : weekend ? "bg-maroon-100/60 text-maroon-600" : "text-maroon-500"
                  )}
                >
                  <span className="text-[9px] uppercase">{fmtWeekday(d, lang)}</span>
                  <span className={cn("text-xs font-bold", isToday && "rounded-full bg-maroon-800 px-1.5 text-gold-100")}>
                    {parseInt(d.slice(8), 10)}
                  </span>
                  <span className="text-[9px] text-maroon-400">
                    {showMonth ? new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : " "}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        {groups.map((group) => {
          const lanes = packLanes(group.unassigned);
          const typeBands = group.typeBlocks
            .map((b) => ({ block: b, placement: placeBar(b.start_date, b.end_date, from, days) }))
            .filter((x): x is { block: CalendarBlock; placement: BarPlacement } => x.placement !== null);
          return (
            <Fragment key={group.type.id}>
              {/* Group header */}
              <div className="flex h-8 border-b border-maroon-100 bg-maroon-100/40">
                <div className="sticky start-0 z-20 flex w-[var(--label)] shrink-0 items-center gap-1 border-e border-maroon-200 bg-maroon-100/90 px-2 text-[11px] font-bold text-maroon-800 backdrop-blur">
                  <span className="truncate">{localName(group.type, lang)}</span>
                  {!group.type.is_active && <span className="text-[9px] font-semibold text-maroon-400">({STR.inactive[lang]})</span>}
                </div>
                <div className="relative flex" style={{ width: trackWidth }}>
                  <DayCells dates={dates} today={today} />
                  {typeBands.map(({ block, placement }) => (
                    <div
                      key={block.id}
                      title={`${STR.stopSell[lang]}${block.reason ? ` · ${block.reason}` : ""}`}
                      style={{ ...barStyle(placement), backgroundImage: HATCH }}
                      className="absolute top-1 z-[5] flex h-[calc(100%-0.5rem)] items-center rounded-md border border-maroon-300 px-1.5 text-[10px] font-bold text-maroon-700"
                    >
                      <span className="truncate">{blockKindLabel(block.kind, lang)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unassigned lanes */}
              {lanes.map((lane, i) => (
                <div key={`u-${group.type.id}-${i}`} className="flex h-9 border-b border-dashed border-gold-300 bg-gold-50/40">
                  <div className="sticky start-0 z-20 flex w-[var(--label)] shrink-0 items-center border-e border-maroon-200 bg-gold-50 px-2 text-[11px] font-semibold italic text-gold-800">
                    {i === 0 ? STR.unassigned[lang] : ""}
                  </div>
                  <div className="relative flex" style={{ width: trackWidth }}>
                    <DayCells dates={dates} today={today} />
                    {lane.map((b) => {
                      const p = placeBar(b.check_in, b.check_out, from, days);
                      return p ? (
                        <BookingBar key={b.id} booking={b} placement={p} selected={selectedId === b.id} onClick={() => onSelectBooking(b.id)} />
                      ) : null;
                    })}
                  </div>
                </div>
              ))}

              {/* Rooms */}
              {group.rooms.length === 0 && lanes.length === 0 && (
                <div className="flex h-8 border-b border-maroon-100">
                  <div className="sticky start-0 z-20 flex w-[var(--label)] shrink-0 items-center border-e border-maroon-200 bg-white px-2 text-[11px] text-maroon-300">
                    {STR.noRooms[lang]}
                  </div>
                </div>
              )}
              {group.rooms.map(({ room, bookings: rb, blocks: rk }) => {
                const maintenance = room.status === "maintenance";
                return (
                  <div key={room.id} className={cn("flex h-9 border-b border-maroon-100", maintenance && "bg-stone-100/70")}>
                    <div
                      className={cn(
                        "sticky start-0 z-20 flex w-[var(--label)] shrink-0 items-center gap-1 border-e border-maroon-200 px-2 text-xs font-bold text-maroon-900",
                        maintenance ? "bg-stone-100" : "bg-white"
                      )}
                      title={room.floor ? `${room.room_number} · ${room.floor}` : room.room_number}
                    >
                      <span className="truncate">{room.room_number}</span>
                      {maintenance && <Wrench className="h-3 w-3 shrink-0 text-stone-600" aria-label={COMMON.maintenance[lang]} />}
                    </div>
                    <div className="relative flex" style={{ width: trackWidth }}>
                      <DayCells
                        dates={dates}
                        today={today}
                        label={`${STR.newHere[lang]} ${room.room_number}`}
                        onClick={(date) =>
                          onSelectCell({ roomId: room.id, roomTypeId: room.room_type_id, roomNumber: room.room_number, date })
                        }
                      />
                      {typeBands.map(({ block, placement }) => (
                        <div
                          key={`band-${block.id}`}
                          aria-hidden
                          style={{ ...barStyle(placement), backgroundImage: HATCH }}
                          className="pointer-events-none absolute inset-y-0 z-[1] opacity-40"
                        />
                      ))}
                      {rk.map((k) => {
                        const p = placeBar(k.start_date, k.end_date, from, days);
                        return p ? <BlockBar key={k.id} block={k} placement={p} lang={lang} /> : null;
                      })}
                      {rb.map((b) => {
                        const p = placeBar(b.check_in, b.check_out, from, days);
                        return p ? (
                          <BookingBar key={b.id} booking={b} placement={p} selected={selectedId === b.id} onClick={() => onSelectBooking(b.id)} />
                        ) : null;
                      })}
                    </div>
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
