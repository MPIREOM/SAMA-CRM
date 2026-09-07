// Pure layout maths for the tape chart. No React, no DOM — unit-tested.
//
// A stay [check_in, check_out) is drawn from the MIDDLE of the check-in day
// cell to the MIDDLE of the check-out day cell, so a departure and the next
// arrival on the same day share one cell without overlapping. All positions
// are in "cell units" (multiply by the CSS cell width to get pixels).

import { addDays, dayOfWeek, nightsBetween, overlaps } from "@/lib/booking-engine/pricing";
import { WEEKEND_DAYS } from "../shared";

export interface CalendarRoomType {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  sort_order: number;
  is_active: boolean;
}

export interface CalendarRoom {
  id: string;
  room_number: string;
  room_type_id: string;
  floor: string | null;
  status: string; // active | maintenance
  sort_order: number;
}

export interface CalendarBooking {
  id: string;
  ref: string;
  guest_name: string;
  guest_phone: string;
  room_type_id: string;
  room_id: string | null;
  check_in: string;
  check_out: string;
  status: string;
  adults: number;
  children: number;
  total_omr: number;
  source: string;
  special_requests: string | null;
  internal_notes: string | null;
}

export interface CalendarBlock {
  id: string;
  room_id: string | null;
  room_type_id: string | null;
  start_date: string;
  end_date: string; // exclusive
  kind: string;
  reason: string | null;
}

export interface BarPlacement {
  /** Inline-start offset in cell units. */
  left: number;
  /** Width in cell units (always > 0). */
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

export const DEFAULT_DAYS = 21;
export const MIN_DAYS = 7;
export const MAX_DAYS = 62;

/** Every date in the visible window: [from, from + days). */
export function dayRange(from: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(addDays(from, i));
  return out;
}

/** Signed day offset of `date` from `from` (negative when before). */
export function dayIndex(date: string, from: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Where a half-open range [start, end) sits inside the visible window.
 * Returns null when it does not touch the window at all.
 */
export function placeBar(start: string, end: string, from: string, days: number): BarPlacement | null {
  if (nightsBetween(start, end) <= 0) return null;
  const rawLeft = dayIndex(start, from) + 0.5;
  const rawRight = dayIndex(end, from) + 0.5;
  const left = Math.max(rawLeft, 0);
  const right = Math.min(rawRight, days);
  if (right <= left) return null;
  return {
    left,
    width: right - left,
    clippedStart: rawLeft < 0,
    clippedEnd: rawRight > days,
  };
}

/** Thursday & Friday nights are shaded as the hotel weekend. */
export function isWeekend(date: string): boolean {
  return WEEKEND_DAYS.includes(dayOfWeek(date));
}

/** Statuses that occupy a room on the chart (cancelled / no-show never draw). */
export function isLiveBooking(status: string): boolean {
  return status !== "cancelled" && status !== "no_show";
}

/**
 * Overlap rule shared with the database:
 * existing.check_in < new.check_out AND existing.check_out > new.check_in.
 * Returns the first conflicting booking or block for `roomId`, or null.
 */
export function findConflict(
  roomId: string,
  checkIn: string,
  checkOut: string,
  bookings: Pick<CalendarBooking, "id" | "room_id" | "check_in" | "check_out" | "status">[],
  blocks: Pick<CalendarBlock, "id" | "room_id" | "start_date" | "end_date">[],
  excludeBookingId: string | null = null
): { kind: "booking" | "block"; id: string } | null {
  for (const b of bookings) {
    if (b.room_id !== roomId || b.id === excludeBookingId || !isLiveBooking(b.status)) continue;
    if (overlaps(b.check_in, b.check_out, checkIn, checkOut)) return { kind: "booking", id: b.id };
  }
  for (const k of blocks) {
    if (k.room_id !== roomId) continue;
    if (overlaps(k.start_date, k.end_date, checkIn, checkOut)) return { kind: "block", id: k.id };
  }
  return null;
}

/** Active rooms of the booking's type that are free for its whole stay. */
export function freeRoomsFor(
  booking: Pick<CalendarBooking, "id" | "room_type_id" | "check_in" | "check_out">,
  rooms: CalendarRoom[],
  bookings: Pick<CalendarBooking, "id" | "room_id" | "check_in" | "check_out" | "status">[],
  blocks: Pick<CalendarBlock, "id" | "room_id" | "start_date" | "end_date">[]
): CalendarRoom[] {
  return rooms.filter(
    (r) =>
      r.room_type_id === booking.room_type_id &&
      r.status === "active" &&
      findConflict(r.id, booking.check_in, booking.check_out, bookings, blocks, booking.id) === null
  );
}

export interface RoomRow {
  room: CalendarRoom;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
}

export interface TypeGroup {
  type: CalendarRoomType;
  rooms: RoomRow[];
  unassigned: CalendarBooking[];
  /** Type-level blocks (stop-sell etc.) drawn as a band across the group. */
  typeBlocks: CalendarBlock[];
}

/** Rooms grouped by type, ordered by type sort_order then room sort_order / number. */
export function buildGroups(
  types: CalendarRoomType[],
  rooms: CalendarRoom[],
  bookings: CalendarBooking[],
  blocks: CalendarBlock[]
): TypeGroup[] {
  const sortedTypes = [...types].sort((a, b) => a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en));
  const byRoom = new Map<string, CalendarBooking[]>();
  const unassignedByType = new Map<string, CalendarBooking[]>();
  for (const b of bookings) {
    if (!isLiveBooking(b.status)) continue;
    if (b.room_id) {
      const list = byRoom.get(b.room_id) ?? [];
      list.push(b);
      byRoom.set(b.room_id, list);
    } else {
      const list = unassignedByType.get(b.room_type_id) ?? [];
      list.push(b);
      unassignedByType.set(b.room_type_id, list);
    }
  }
  const blocksByRoom = new Map<string, CalendarBlock[]>();
  const blocksByType = new Map<string, CalendarBlock[]>();
  for (const k of blocks) {
    if (k.room_id) {
      const list = blocksByRoom.get(k.room_id) ?? [];
      list.push(k);
      blocksByRoom.set(k.room_id, list);
    } else if (k.room_type_id) {
      const list = blocksByType.get(k.room_type_id) ?? [];
      list.push(k);
      blocksByType.set(k.room_type_id, list);
    }
  }
  return sortedTypes.map((type) => {
    const typeRooms = rooms
      .filter((r) => r.room_type_id === type.id)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
      );
    return {
      type,
      rooms: typeRooms.map((room) => ({
        room,
        bookings: (byRoom.get(room.id) ?? []).sort((a, b) => a.check_in.localeCompare(b.check_in)),
        blocks: blocksByRoom.get(room.id) ?? [],
      })),
      unassigned: (unassignedByType.get(type.id) ?? []).sort((a, b) => a.check_in.localeCompare(b.check_in)),
      typeBlocks: blocksByType.get(type.id) ?? [],
    };
  });
}

/**
 * Unassigned bookings of one type can overlap each other; pack them into
 * lanes (rows) greedily so nothing is drawn on top of anything else.
 */
export function packLanes<T extends { check_in: string; check_out: string }>(items: T[]): T[][] {
  const lanes: T[][] = [];
  const sorted = [...items].sort((a, b) => a.check_in.localeCompare(b.check_in));
  for (const item of sorted) {
    let placed = false;
    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      if (last.check_out <= item.check_in) {
        lane.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([item]);
  }
  return lanes;
}

/** Clamp the requested window length to something the browser can draw. */
export function clampDays(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(value)));
}
