import { describe, expect, it } from "vitest";
import {
  buildGroups,
  clampDays,
  dayIndex,
  dayRange,
  findConflict,
  freeRoomsFor,
  isWeekend,
  packLanes,
  placeBar,
  type CalendarBlock,
  type CalendarBooking,
  type CalendarRoom,
  type CalendarRoomType,
} from "../calendar/layout";

const FROM = "2026-09-07"; // Monday
const DAYS = 21;

function booking(partial: Partial<CalendarBooking> & Pick<CalendarBooking, "id" | "check_in" | "check_out">): CalendarBooking {
  return {
    ref: `SAMA-26-${partial.id}`,
    guest_name: "Guest",
    guest_phone: "+96891234567",
    room_type_id: "t1",
    room_id: null,
    status: "confirmed",
    adults: 2,
    children: 0,
    total_omr: 100,
    source: "staff",
    special_requests: null,
    internal_notes: null,
    ...partial,
  };
}

describe("dayRange / dayIndex", () => {
  it("builds the visible window", () => {
    const days = dayRange(FROM, 3);
    expect(days).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
  });

  it("computes signed offsets, including across month ends", () => {
    expect(dayIndex("2026-09-07", FROM)).toBe(0);
    expect(dayIndex("2026-09-10", FROM)).toBe(3);
    expect(dayIndex("2026-09-05", FROM)).toBe(-2);
    expect(dayIndex("2026-10-01", FROM)).toBe(24);
  });
});

describe("placeBar", () => {
  it("draws a stay from the middle of check-in to the middle of check-out", () => {
    const p = placeBar("2026-09-08", "2026-09-11", FROM, DAYS);
    expect(p).toEqual({ left: 1.5, width: 3, clippedStart: false, clippedEnd: false });
  });

  it("clips a stay that started before the window", () => {
    const p = placeBar("2026-09-05", "2026-09-09", FROM, DAYS);
    expect(p).toEqual({ left: 0, width: 2.5, clippedStart: true, clippedEnd: false });
  });

  it("clips a stay that ends after the window", () => {
    const p = placeBar("2026-09-26", "2026-09-30", FROM, DAYS);
    // check-in index 19 → left 19.5; check-out index 23 → clipped to 21
    expect(p).toEqual({ left: 19.5, width: 1.5, clippedStart: false, clippedEnd: true });
  });

  it("clips both ends when the stay spans the whole window", () => {
    const p = placeBar("2026-09-01", "2026-10-15", FROM, DAYS);
    expect(p).toEqual({ left: 0, width: DAYS, clippedStart: true, clippedEnd: true });
  });

  it("returns null when the stay is outside the window or has no nights", () => {
    expect(placeBar("2026-08-01", "2026-08-05", FROM, DAYS)).toBeNull();
    expect(placeBar("2026-10-10", "2026-10-12", FROM, DAYS)).toBeNull();
    expect(placeBar("2026-09-10", "2026-09-10", FROM, DAYS)).toBeNull();
    expect(placeBar("2026-09-12", "2026-09-10", FROM, DAYS)).toBeNull();
  });

  it("lets a departure and an arrival on the same day share one cell", () => {
    const a = placeBar("2026-09-08", "2026-09-10", FROM, DAYS)!;
    const b = placeBar("2026-09-10", "2026-09-12", FROM, DAYS)!;
    expect(a.left + a.width).toBe(b.left);
  });

  it("a stay checking out on the first visible day is still drawn (half cell)", () => {
    const p = placeBar("2026-09-05", "2026-09-07", FROM, DAYS);
    expect(p).toEqual({ left: 0, width: 0.5, clippedStart: true, clippedEnd: false });
  });
});

describe("isWeekend", () => {
  it("treats Thursday and Friday as the weekend", () => {
    expect(isWeekend("2026-09-10")).toBe(true); // Thu
    expect(isWeekend("2026-09-11")).toBe(true); // Fri
    expect(isWeekend("2026-09-12")).toBe(false); // Sat
    expect(isWeekend("2026-09-07")).toBe(false); // Mon
  });
});

describe("findConflict / freeRoomsFor", () => {
  const rooms: CalendarRoom[] = [
    { id: "r1", room_number: "101", room_type_id: "t1", floor: "1", status: "active", sort_order: 1 },
    { id: "r2", room_number: "102", room_type_id: "t1", floor: "1", status: "active", sort_order: 2 },
    { id: "r3", room_number: "103", room_type_id: "t1", floor: "1", status: "maintenance", sort_order: 3 },
    { id: "r9", room_number: "201", room_type_id: "t2", floor: "2", status: "active", sort_order: 1 },
  ];
  const bookings: CalendarBooking[] = [
    booking({ id: "b1", room_id: "r1", check_in: "2026-09-08", check_out: "2026-09-10" }),
    booking({ id: "b2", room_id: "r2", check_in: "2026-09-12", check_out: "2026-09-14", status: "cancelled" }),
  ];
  const blocks: CalendarBlock[] = [
    { id: "k1", room_id: "r2", room_type_id: null, start_date: "2026-09-09", end_date: "2026-09-11", kind: "maintenance", reason: null },
  ];

  it("applies the half-open overlap rule", () => {
    expect(findConflict("r1", "2026-09-10", "2026-09-12", bookings, blocks)).toBeNull(); // back-to-back OK
    expect(findConflict("r1", "2026-09-09", "2026-09-12", bookings, blocks)).toEqual({ kind: "booking", id: "b1" });
    expect(findConflict("r1", "2026-09-06", "2026-09-09", bookings, blocks)).toEqual({ kind: "booking", id: "b1" });
  });

  it("ignores cancelled bookings and the booking being moved", () => {
    expect(findConflict("r2", "2026-09-12", "2026-09-14", bookings, blocks)).toBeNull();
    expect(findConflict("r1", "2026-09-08", "2026-09-10", bookings, blocks, "b1")).toBeNull();
  });

  it("detects room-level blocks", () => {
    expect(findConflict("r2", "2026-09-10", "2026-09-12", bookings, blocks)).toEqual({ kind: "block", id: "k1" });
    expect(findConflict("r2", "2026-09-11", "2026-09-12", bookings, blocks)).toBeNull();
  });

  it("lists free active rooms of the same type only", () => {
    const target = booking({ id: "new", check_in: "2026-09-09", check_out: "2026-09-11", room_type_id: "t1" });
    // r1 busy (b1), r2 blocked (k1), r3 maintenance, r9 wrong type
    expect(freeRoomsFor(target, rooms, bookings, blocks).map((r) => r.id)).toEqual([]);
    const later = booking({ id: "new2", check_in: "2026-09-11", check_out: "2026-09-13", room_type_id: "t1" });
    expect(freeRoomsFor(later, rooms, bookings, blocks).map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("buildGroups", () => {
  const types: CalendarRoomType[] = [
    { id: "t2", slug: "b", name_en: "B", name_ar: "ب", sort_order: 20, is_active: true },
    { id: "t1", slug: "a", name_en: "A", name_ar: "أ", sort_order: 10, is_active: true },
  ];
  const rooms: CalendarRoom[] = [
    { id: "r2", room_number: "102", room_type_id: "t1", floor: null, status: "active", sort_order: 2 },
    { id: "r1", room_number: "101", room_type_id: "t1", floor: null, status: "active", sort_order: 1 },
    { id: "r9", room_number: "C01", room_type_id: "t2", floor: null, status: "active", sort_order: 1 },
  ];
  const bookings: CalendarBooking[] = [
    booking({ id: "b1", room_id: "r1", check_in: "2026-09-08", check_out: "2026-09-10" }),
    booking({ id: "b2", room_id: null, check_in: "2026-09-08", check_out: "2026-09-10" }),
    booking({ id: "b3", room_id: null, check_in: "2026-09-08", check_out: "2026-09-10", status: "no_show" }),
  ];
  const blocks: CalendarBlock[] = [
    { id: "k1", room_id: null, room_type_id: "t1", start_date: "2026-09-20", end_date: "2026-09-22", kind: "stop_sell", reason: null },
    { id: "k2", room_id: "r2", room_type_id: null, start_date: "2026-09-20", end_date: "2026-09-22", kind: "block", reason: null },
  ];

  it("orders types and rooms and separates unassigned + type blocks", () => {
    const groups = buildGroups(types, rooms, bookings, blocks);
    expect(groups.map((g) => g.type.id)).toEqual(["t1", "t2"]);
    expect(groups[0].rooms.map((r) => r.room.room_number)).toEqual(["101", "102"]);
    expect(groups[0].rooms[0].bookings.map((b) => b.id)).toEqual(["b1"]);
    expect(groups[0].rooms[1].blocks.map((b) => b.id)).toEqual(["k2"]);
    expect(groups[0].unassigned.map((b) => b.id)).toEqual(["b2"]); // no_show dropped
    expect(groups[0].typeBlocks.map((b) => b.id)).toEqual(["k1"]);
    expect(groups[1].unassigned).toEqual([]);
  });
});

describe("packLanes", () => {
  it("puts overlapping stays on separate lanes and reuses lanes when free", () => {
    const lanes = packLanes([
      { id: 1, check_in: "2026-09-08", check_out: "2026-09-10" },
      { id: 2, check_in: "2026-09-09", check_out: "2026-09-11" },
      { id: 3, check_in: "2026-09-10", check_out: "2026-09-12" },
    ]);
    expect(lanes.map((l) => l.map((i) => i.id))).toEqual([[1, 3], [2]]);
  });
});

describe("clampDays", () => {
  it("defaults and clamps", () => {
    expect(clampDays(undefined)).toBe(21);
    expect(clampDays(Number.NaN)).toBe(21);
    expect(clampDays(3)).toBe(7);
    expect(clampDays(500)).toBe(62);
    expect(clampDays(30)).toBe(30);
  });
});
