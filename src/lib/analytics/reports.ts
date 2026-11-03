import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { formatOmr } from "@/lib/booking-engine/pricing";
import { addonsSummary } from "@/components/admin/shared";
import { fetchAll, loadCatalog, loadStays, muscatStart } from "./load";
import { addDaysIso, revenueStats } from "./stats";

type Admin = ReturnType<typeof createAdminClient>;
import type { Cell, Sheet } from "./serialize";
export type Report = { file: string; sheets: Sheet[] };

export const REPORT_TYPES = ["reservations", "revenue", "addons", "guests", "daily"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportParams {
  from: string;
  to: string;
  /** reservations: which date the range applies to. */
  basis?: "check_in" | "created" | "stay";
  status?: "all" | "live" | "cancelled";
  source?: string;
  roomType?: string;
}

const LIVE_STATUSES = ["pending", "confirmed", "checked_in", "checked_out"];
const num = (v: unknown) => Number(formatOmr(Number(v ?? 0)));
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type BookingFull = {
  id: string;
  ref: string;
  status: string;
  source: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  nationality: string | null;
  preferred_lang: string;
  room_type_id: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  room_subtotal_omr: number;
  discount_omr: number;
  addons_omr: number;
  service_charge_omr: number;
  tourism_fee_omr: number;
  vat_omr: number;
  total_omr: number;
  promo_code: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  room_type: { name_en: string } | { name_en: string }[] | null;
  room: { room_number: string } | { room_number: string }[] | null;
  addons: { quantity: number; status: string; total_omr: number; note: string | null; addon: { name_en: string } | { name_en: string }[] | null }[] | null;
};

const FULL =
  "id, ref, status, source, guest_name, guest_phone, guest_email, nationality, preferred_lang, room_type_id, check_in, check_out, nights, adults, children, room_subtotal_omr, discount_omr, addons_omr, service_charge_omr, tourism_fee_omr, vat_omr, total_omr, promo_code, special_requests, internal_notes, created_at, cancelled_at, cancel_reason, checked_in_at, checked_out_at, room_type:bk_room_types(name_en), room:bk_rooms(room_number), addons:bk_booking_addons(quantity, status, total_omr, note, addon:bk_addons(name_en))";

function addonLines(b: BookingFull) {
  return (b.addons ?? []).map((l) => ({ ...l, addon: one(l.addon) }));
}

function reservationRow(b: BookingFull): Record<string, Cell> {
  return {
    Ref: b.ref,
    Status: b.status,
    Source: b.source,
    Guest: b.guest_name,
    Phone: b.guest_phone,
    Email: b.guest_email,
    Nationality: b.nationality,
    Language: b.preferred_lang,
    Category: one(b.room_type)?.name_en ?? "",
    Room: one(b.room)?.room_number ?? "",
    "Check-in": b.check_in,
    "Check-out": b.check_out,
    Nights: b.nights,
    Adults: b.adults,
    Children: b.children,
    "Add-ons": addonsSummary(addonLines(b)),
    "Room subtotal (OMR)": num(b.room_subtotal_omr),
    "Discount (OMR)": num(b.discount_omr),
    "Add-ons (OMR)": num(b.addons_omr),
    "Service charge (OMR)": num(b.service_charge_omr),
    "Tourism fee (OMR)": num(b.tourism_fee_omr),
    "VAT (OMR)": num(b.vat_omr),
    "Total (OMR)": num(b.total_omr),
    "Promo code": b.promo_code,
    "Special requests": b.special_requests,
    "Internal notes": b.internal_notes,
    "Booked at": b.created_at,
    "Cancelled at": b.cancelled_at,
    "Cancel reason": b.cancel_reason,
  };
}

async function reservations(admin: Admin, p: ReportParams): Promise<Report> {
  const basis = p.basis ?? "check_in";
  const rows = await fetchAll<BookingFull>((a, z) => {
    let q = admin.from("bk_bookings").select(FULL);
    if (basis === "created") q = q.gte("created_at", muscatStart(p.from)).lt("created_at", muscatStart(addDaysIso(p.to, 1)));
    else if (basis === "stay") q = q.lte("check_in", p.to).gt("check_out", p.from);
    else q = q.gte("check_in", p.from).lte("check_in", p.to);
    if (p.status === "live") q = q.in("status", LIVE_STATUSES);
    if (p.status === "cancelled") q = q.in("status", ["cancelled", "no_show"]);
    if (p.source) q = q.eq("source", p.source);
    if (p.roomType) q = q.eq("room_type_id", p.roomType);
    return q.order("check_in").order("id").range(a, z);
  });
  return { file: `sama-reservations-${p.from}-to-${p.to}`, sheets: [{ name: "Reservations", rows: rows.map(reservationRow) }] };
}

async function revenue(admin: Admin, p: ReportParams): Promise<Report> {
  const [stays, catalog] = await Promise.all([loadStays(admin, p.from, p.to), loadCatalog(admin)]);
  const r = revenueStats(stays, catalog.roomsByType, p.from, p.to);
  const name = (id: string) => catalog.types.find((t) => t.id === id)?.name_en ?? id;
  const pctCell = (v: number) => Math.round(v * 1000) / 10;
  return {
    file: `sama-revenue-${p.from}-to-${p.to}`,
    sheets: [
      {
        name: "Daily",
        rows: r.daily.map((d) => ({
          Date: d.date,
          "Rooms available": d.available,
          "Rooms sold": d.sold,
          "Occupancy %": pctCell(d.occupancy),
          "Room revenue (OMR)": num(d.roomRevenue),
          "ADR (OMR)": num(d.adr),
          "RevPAR (OMR)": num(d.revpar),
        })),
      },
      {
        name: "By category",
        rows: r.byCategory.map((c) => ({
          Category: name(c.room_type_id),
          Rooms: c.rooms,
          "Room-nights available": c.available,
          "Room-nights sold": c.sold,
          "Occupancy %": pctCell(c.occupancy),
          "Room revenue (OMR)": num(c.roomRevenue),
          "ADR (OMR)": num(c.adr),
        })),
      },
      {
        name: "By month",
        rows: r.monthly.map((m) => ({
          Month: m.month,
          "Room-nights available": m.available,
          "Room-nights sold": m.sold,
          "Occupancy %": pctCell(m.occupancy),
          "Room revenue (OMR)": num(m.roomRevenue),
          "ADR (OMR)": num(m.adr),
          "RevPAR (OMR)": num(m.revpar),
        })),
      },
      {
        name: "Summary",
        rows: [
          { Item: "Period", Value: `${p.from} to ${p.to}` },
          { Item: "Room-nights available", Value: r.roomNightsAvailable },
          { Item: "Room-nights sold", Value: r.roomNightsSold },
          { Item: "Occupancy %", Value: pctCell(r.occupancy) },
          { Item: "Room revenue, net of discounts (OMR)", Value: num(r.roomRevenue) },
          { Item: "ADR (OMR)", Value: num(r.adr) },
          { Item: "RevPAR (OMR)", Value: num(r.revpar) },
          { Item: "Service charge (OMR)", Value: num(r.serviceCharge) },
          { Item: "Tourism fee (OMR)", Value: num(r.tourismFee) },
          { Item: "VAT (OMR)", Value: num(r.vat) },
          { Item: "Add-ons (OMR)", Value: num(r.addons) },
          { Item: "Total revenue (OMR)", Value: num(r.totalRevenue) },
          { Item: "Note", Value: "Stay-based: each night is counted on the date it is stayed; taxes and add-ons are spread across a booking's nights." },
        ],
      },
    ],
  };
}

async function addons(admin: Admin, p: ReportParams): Promise<Report> {
  const rows = await fetchAll<BookingFull>((a, z) => admin.from("bk_bookings").select(FULL).gte("check_in", p.from).lte("check_in", p.to).order("check_in").order("id").range(a, z));
  const lines: Record<string, Cell>[] = [];
  const totals = new Map<string, { qty: number; revenue: number; bookings: number }>();
  for (const b of rows) {
    for (const l of addonLines(b)) {
      const live = l.status !== "cancelled" && LIVE_STATUSES.includes(b.status);
      lines.push({
        "Check-in": b.check_in,
        Ref: b.ref,
        Guest: b.guest_name,
        Phone: b.guest_phone,
        "Booking status": b.status,
        "Add-on": l.addon?.name_en ?? "",
        Quantity: l.quantity,
        "Total (OMR)": num(l.total_omr),
        "Add-on status": l.status,
        Note: l.note,
      });
      if (live) {
        const k = l.addon?.name_en ?? "?";
        const t = totals.get(k) ?? { qty: 0, revenue: 0, bookings: 0 };
        t.qty += l.quantity;
        t.revenue += Number(l.total_omr);
        t.bookings++;
        totals.set(k, t);
      }
    }
  }
  return {
    file: `sama-addons-${p.from}-to-${p.to}`,
    sheets: [
      { name: "Add-on lines", rows: lines },
      { name: "Totals", rows: Array.from(totals.entries()).map(([k, t]) => ({ "Add-on": k, Bookings: t.bookings, Quantity: t.qty, "Revenue (OMR)": num(t.revenue) })) },
    ],
  };
}

async function guests(admin: Admin, p: ReportParams): Promise<Report> {
  const rows = await fetchAll<BookingFull>((a, z) => admin.from("bk_bookings").select(FULL).lte("check_in", p.to).gt("check_out", p.from).in("status", LIVE_STATUSES).order("check_in").order("id").range(a, z));
  const byGuest = new Map<string, { name: string; phone: string; email: string | null; nat: string | null; lang: string; stays: number; nights: number; spent: number; first: string; last: string; refs: string[] }>();
  for (const b of rows) {
    const k = b.guest_phone;
    const g = byGuest.get(k) ?? { name: b.guest_name, phone: b.guest_phone, email: b.guest_email, nat: b.nationality, lang: b.preferred_lang, stays: 0, nights: 0, spent: 0, first: b.check_in, last: b.check_in, refs: [] };
    g.stays++;
    g.nights += b.nights;
    g.spent += Number(b.total_omr);
    g.email = g.email ?? b.guest_email;
    if (b.check_in < g.first) g.first = b.check_in;
    if (b.check_in > g.last) {
      g.last = b.check_in;
      g.name = b.guest_name;
    }
    g.refs.push(b.ref);
    byGuest.set(k, g);
  }
  return {
    file: `sama-guests-${p.from}-to-${p.to}`,
    sheets: [
      {
        name: "Guests",
        rows: Array.from(byGuest.values())
          .sort((a, b) => b.spent - a.spent)
          .map((g) => ({
            Guest: g.name,
            Phone: g.phone,
            Email: g.email,
            Nationality: g.nat,
            Language: g.lang,
            Stays: g.stays,
            Nights: g.nights,
            "Total spent (OMR)": num(g.spent),
            "First check-in": g.first,
            "Last check-in": g.last,
            Bookings: g.refs.join(", "),
          })),
      },
    ],
  };
}

export type DailyList = { arrivals: BookingFull[]; departures: BookingFull[]; inHouse: BookingFull[] };

/** Front-desk lists for one date: arriving, departing, and staying over that night. */
export async function loadDailyLists(admin: Admin, date: string): Promise<DailyList> {
  const rows = await fetchAll<BookingFull>((a, z) => admin.from("bk_bookings").select(FULL).lte("check_in", date).gte("check_out", date).in("status", LIVE_STATUSES).order("check_in").order("id").range(a, z));
  const byRoom = (x: BookingFull, y: BookingFull) => (one(x.room)?.room_number ?? "~").localeCompare(one(y.room)?.room_number ?? "~") || x.guest_name.localeCompare(y.guest_name);
  return {
    arrivals: rows.filter((b) => b.check_in === date).sort(byRoom),
    departures: rows.filter((b) => b.check_out === date).sort(byRoom),
    inHouse: rows.filter((b) => b.check_in <= date && b.check_out > date).sort(byRoom),
  };
}

export function dailyRow(b: BookingFull): Record<string, Cell> {
  return {
    Room: one(b.room)?.room_number ?? "",
    Category: one(b.room_type)?.name_en ?? "",
    Guest: b.guest_name,
    Phone: b.guest_phone,
    Ref: b.ref,
    "Check-in": b.check_in,
    "Check-out": b.check_out,
    Nights: b.nights,
    Guests: `${b.adults}+${b.children}`,
    Status: b.status,
    "Add-ons": addonsSummary(addonLines(b)),
    "Total due (OMR)": num(b.total_omr),
    "Special requests": b.special_requests,
    "Internal notes": b.internal_notes,
  };
}

async function daily(admin: Admin, p: ReportParams): Promise<Report> {
  const l = await loadDailyLists(admin, p.from);
  return {
    file: `sama-front-desk-${p.from}`,
    sheets: [
      { name: "Arrivals", rows: l.arrivals.map(dailyRow) },
      { name: "Departures", rows: l.departures.map(dailyRow) },
      { name: "In-house", rows: l.inHouse.map(dailyRow) },
    ],
  };
}

export async function buildReport(admin: Admin, type: ReportType, p: ReportParams): Promise<Report> {
  switch (type) {
    case "reservations":
      return reservations(admin, p);
    case "revenue":
      return revenue(admin, p);
    case "addons":
      return addons(admin, p);
    case "guests":
      return guests(admin, p);
    case "daily":
      return daily(admin, p);
  }
}
