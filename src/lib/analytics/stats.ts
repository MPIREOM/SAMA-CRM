// Pure statistics for the back-office Analytics page and Reports exports.
// Inputs are plain rows (already fetched); no server imports, unit-tested.

import { roundOmr } from "@/lib/booking-engine/pricing";

const DAY = 86_400_000;
const LIVE = (status: string) => status !== "cancelled" && status !== "no_show";

/** YYYY-MM-DD of an ISO timestamp in Muscat time (UTC+4, no DST). */
export function muscatDateOf(ts: string): string {
  return new Date(new Date(ts).getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

export function addDaysIso(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

/** Every date from `from` to `to` inclusive. */
export function dateList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

export interface Ranked {
  key: string;
  value: number;
}

function rank(map: Map<string, number>, limit = 10): Ranked[] {
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function bump(map: Map<string, number>, key: string | null | undefined, by = 1) {
  const k = key || "unknown";
  map.set(k, (map.get(k) ?? 0) + by);
}

// ---------------------------------------------------------------------------
// Website traffic + booking funnel (bk_web_events)
// ---------------------------------------------------------------------------

export interface WebEvent {
  created_at: string;
  kind: string;
  visitor_id: string;
  session_id: string;
  path: string;
  page_type: string;
  locale: string | null;
  source: string;
  country: string | null;
  device: string | null;
  browser: string | null;
  room_slug: string | null;
}

export interface TrafficStats {
  visitors: number;
  sessions: number;
  pageviews: number;
  pagesPerSession: number;
  bounceRate: number; // 0..1, sessions with a single page view
  daily: { date: string; visitors: number; pageviews: number }[];
  pages: Ranked[];
  sources: Ranked[]; // by sessions
  countries: Ranked[]; // by sessions
  devices: Ranked[]; // by sessions
  languages: Ranked[]; // by sessions
  browsers: Ranked[]; // by sessions
}

export function trafficStats(events: WebEvent[], from: string, to: string): TrafficStats {
  const views = events.filter((e) => e.kind === "pageview");
  const visitors = new Set<string>();
  const perSession = new Map<string, { views: number; first: WebEvent }>();
  const dailyV = new Map<string, Set<string>>();
  const dailyP = new Map<string, number>();
  const pages = new Map<string, number>();
  for (const e of views) {
    visitors.add(e.visitor_id);
    const s = perSession.get(e.session_id);
    if (s) s.views++;
    else perSession.set(e.session_id, { views: 1, first: e });
    const d = muscatDateOf(e.created_at);
    if (!dailyV.has(d)) dailyV.set(d, new Set());
    dailyV.get(d)!.add(e.visitor_id);
    dailyP.set(d, (dailyP.get(d) ?? 0) + 1);
    bump(pages, e.path);
  }
  const sources = new Map<string, number>();
  const countries = new Map<string, number>();
  const devices = new Map<string, number>();
  const languages = new Map<string, number>();
  const browsers = new Map<string, number>();
  let bounces = 0;
  for (const { views: n, first } of Array.from(perSession.values())) {
    if (n === 1) bounces++;
    bump(sources, first.source);
    bump(countries, first.country);
    bump(devices, first.device);
    bump(languages, first.locale);
    bump(browsers, first.browser);
  }
  const sessions = perSession.size;
  return {
    visitors: visitors.size,
    sessions,
    pageviews: views.length,
    pagesPerSession: sessions ? views.length / sessions : 0,
    bounceRate: sessions ? bounces / sessions : 0,
    daily: dateList(from, to).map((date) => ({ date, visitors: dailyV.get(date)?.size ?? 0, pageviews: dailyP.get(date) ?? 0 })),
    pages: rank(pages),
    sources: rank(sources),
    countries: rank(countries),
    devices: rank(devices),
    languages: rank(languages),
    browsers: rank(browsers),
  };
}

export interface FunnelStep {
  key: "sessions" | "results" | "booking" | "review" | "confirmed";
  sessions: number;
}

/** Sessions reaching each step of the booking journey (a step counts sessions that reached it or any later step). */
export function bookingFunnel(events: WebEvent[]): { steps: FunnelStep[]; roomInterest: Ranked[] } {
  const reached = { sessions: new Set<string>(), results: new Set<string>(), booking: new Set<string>(), review: new Set<string>(), confirmed: new Set<string>() };
  const interest = new Map<string, Set<string>>();
  for (const e of events) {
    reached.sessions.add(e.session_id);
    if (e.kind === "booking_review") reached.review.add(e.session_id);
    else if (e.page_type === "results") reached.results.add(e.session_id);
    else if (e.page_type === "booking") {
      reached.booking.add(e.session_id);
      if (e.room_slug) {
        if (!interest.has(e.room_slug)) interest.set(e.room_slug, new Set());
        interest.get(e.room_slug)!.add(e.session_id);
      }
    } else if (e.page_type === "confirmation") reached.confirmed.add(e.session_id);
  }
  // A session that reached a later step counts as having passed every earlier
  // one (e.g. a room page linking straight to booking, or a guest reopening a
  // confirmation link), so the funnel only ever narrows.
  const order = ["sessions", "results", "booking", "review", "confirmed"] as const;
  const counts = order.map((key, i) => {
    const union = new Set<string>();
    for (const later of order.slice(i)) reached[later].forEach((id) => union.add(id));
    return { key, sessions: union.size };
  });
  return {
    steps: counts,
    roomInterest: rank(new Map(Array.from(interest.entries()).map(([k, v]) => [k, v.size]))),
  };
}

// ---------------------------------------------------------------------------
// Revenue & occupancy (stays) and booking patterns (bookings made)
// ---------------------------------------------------------------------------

export interface BookingRow {
  id: string;
  ref: string;
  status: string;
  source: string;
  room_type_id: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  nightly_rates: { date: string; rate: number }[] | null;
  room_subtotal_omr: number;
  discount_omr: number;
  addons_omr: number;
  service_charge_omr: number;
  tourism_fee_omr: number;
  vat_omr: number;
  total_omr: number;
  promo_code: string | null;
  nationality: string | null;
  created_at: string;
}

export interface RevenueDay {
  date: string;
  available: number; // sellable room-nights
  sold: number; // occupied room-nights
  roomRevenue: number; // OMR, net of discount, before taxes
  occupancy: number; // 0..1
  adr: number;
  revpar: number;
}

export interface RevenueStats {
  roomNightsAvailable: number;
  roomNightsSold: number;
  occupancy: number;
  roomRevenue: number;
  adr: number;
  revpar: number;
  /** Taxes and add-ons attributed to the nights in range (pro-rata by nights). */
  serviceCharge: number;
  tourismFee: number;
  vat: number;
  addons: number;
  totalRevenue: number;
  guests: number; // guest-nights / nights → average guests in house per night is derived in UI
  daily: RevenueDay[];
  monthly: (Omit<RevenueDay, "date"> & { month: string })[];
  byCategory: { room_type_id: string; rooms: number; sold: number; available: number; occupancy: number; roomRevenue: number; adr: number }[];
}

function nightRate(b: BookingRow, date: string): number {
  const nightly = Array.isArray(b.nightly_rates) ? b.nightly_rates : [];
  const hit = nightly.find((n) => n.date === date);
  const gross = hit ? Number(hit.rate) : b.nights > 0 ? Number(b.room_subtotal_omr) / b.nights : 0;
  // Spread the booking discount evenly over its nights.
  return gross - (b.nights > 0 ? Number(b.discount_omr) / b.nights : 0);
}

function agg(available: number, sold: number, revenue: number) {
  return {
    available,
    sold,
    roomRevenue: roundOmr(revenue),
    occupancy: available ? sold / available : 0,
    adr: sold ? roundOmr(revenue / sold) : 0,
    revpar: available ? roundOmr(revenue / available) : 0,
  };
}

/**
 * Stay-based revenue for nights from..to (inclusive). `roomsByType` = active
 * rooms per category; room-nights available exclude nothing for blocks (a
 * blocked room is still inventory the hotel owns — the industry convention).
 */
export function revenueStats(bookings: BookingRow[], roomsByType: Map<string, number>, from: string, to: string): RevenueStats {
  const dates = dateList(from, to);
  const totalRooms = Array.from(roomsByType.values()).reduce((a, b) => a + b, 0);
  const soldByDay = new Map<string, number>();
  const revByDay = new Map<string, number>();
  const cat = new Map<string, { sold: number; rev: number }>();
  let service = 0,
    tourism = 0,
    vat = 0,
    addons = 0,
    guestNights = 0;
  for (const b of bookings) {
    if (!LIVE(b.status) || b.nights <= 0) continue;
    let inRange = 0;
    for (let d = b.check_in; d < b.check_out; d = addDaysIso(d, 1)) {
      if (d < from || d > to) continue;
      inRange++;
      const r = nightRate(b, d);
      soldByDay.set(d, (soldByDay.get(d) ?? 0) + 1);
      revByDay.set(d, (revByDay.get(d) ?? 0) + r);
      const c = cat.get(b.room_type_id) ?? { sold: 0, rev: 0 };
      c.sold++;
      c.rev += r;
      cat.set(b.room_type_id, c);
      guestNights += b.adults + b.children;
    }
    if (inRange) {
      const share = inRange / b.nights;
      service += Number(b.service_charge_omr) * share;
      tourism += Number(b.tourism_fee_omr) * share;
      vat += Number(b.vat_omr) * share;
      addons += Number(b.addons_omr) * share;
    }
  }
  const daily: RevenueDay[] = dates.map((date) => ({ date, ...agg(totalRooms, soldByDay.get(date) ?? 0, revByDay.get(date) ?? 0) }));
  const months = new Map<string, { a: number; s: number; r: number }>();
  for (const d of daily) {
    const m = d.date.slice(0, 7);
    const v = months.get(m) ?? { a: 0, s: 0, r: 0 };
    v.a += d.available;
    v.s += d.sold;
    v.r += d.roomRevenue;
    months.set(m, v);
  }
  const available = totalRooms * dates.length;
  const sold = daily.reduce((a, d) => a + d.sold, 0);
  const roomRevenue = daily.reduce((a, d) => a + d.roomRevenue, 0);
  const total = agg(available, sold, roomRevenue);
  return {
    roomNightsAvailable: available,
    roomNightsSold: sold,
    occupancy: total.occupancy,
    roomRevenue: total.roomRevenue,
    adr: total.adr,
    revpar: total.revpar,
    serviceCharge: roundOmr(service),
    tourismFee: roundOmr(tourism),
    vat: roundOmr(vat),
    addons: roundOmr(addons),
    totalRevenue: roundOmr(roomRevenue + service + tourism + vat + addons),
    guests: guestNights,
    daily,
    monthly: Array.from(months.entries()).map(([month, v]) => ({ month, ...agg(v.a, v.s, v.r) })),
    byCategory: Array.from(roomsByType.entries()).map(([room_type_id, rooms]) => {
      const c = cat.get(room_type_id) ?? { sold: 0, rev: 0 };
      const a = agg(rooms * dates.length, c.sold, c.rev);
      return { room_type_id, rooms, sold: c.sold, available: a.available, occupancy: a.occupancy, roomRevenue: a.roomRevenue, adr: a.adr };
    }),
  };
}

export interface AddonLine {
  booking_id: string;
  addon_id: string;
  quantity: number;
  total_omr: number;
  status: string;
}

export interface PatternStats {
  bookings: number;
  live: number;
  cancelled: number;
  noShow: number;
  cancellationRate: number;
  bookedValue: number; // total_omr of live bookings made in range
  bySource: { key: string; bookings: number; value: number }[];
  avgLeadTime: number; // days from booking to check-in
  leadTime: Ranked[]; // buckets, in fixed order
  avgLengthOfStay: number;
  lengthOfStay: Ranked[]; // buckets, in fixed order
  avgPartySize: number;
  addons: { addon_id: string; quantity: number; revenue: number; bookings: number }[];
  promos: { code: string; bookings: number; discount: number }[];
  nationalities: Ranked[];
}

const LEAD_BUCKETS: [string, number][] = [
  ["Same day", 0],
  ["1–3 days", 3],
  ["4–7 days", 7],
  ["8–14 days", 14],
  ["15–30 days", 30],
  ["31–60 days", 60],
  ["60+ days", Infinity],
];
const LOS_BUCKETS: [string, number][] = [
  ["1 night", 1],
  ["2 nights", 2],
  ["3 nights", 3],
  ["4–6 nights", 6],
  ["7+ nights", Infinity],
];

function bucket(buckets: [string, number][], v: number): string {
  return buckets.find(([, max]) => v <= max)![0];
}

/** Bookings MADE in the range (by created_at, Muscat date). */
export function patternStats(bookings: BookingRow[], addonLines: AddonLine[]): PatternStats {
  const live = bookings.filter((b) => LIVE(b.status));
  const cancelled = bookings.filter((b) => b.status === "cancelled").length;
  const noShow = bookings.filter((b) => b.status === "no_show").length;
  const src = new Map<string, { bookings: number; value: number }>();
  for (const b of bookings) {
    const v = src.get(b.source) ?? { bookings: 0, value: 0 };
    v.bookings++;
    if (LIVE(b.status)) v.value += Number(b.total_omr);
    src.set(b.source, v);
  }
  const lead = new Map(LEAD_BUCKETS.map(([k]) => [k, 0]));
  const los = new Map(LOS_BUCKETS.map(([k]) => [k, 0]));
  let leadSum = 0,
    losSum = 0,
    party = 0;
  const nat = new Map<string, number>();
  const promos = new Map<string, { bookings: number; discount: number }>();
  for (const b of live) {
    const lt = Math.max(0, daysBetween(muscatDateOf(b.created_at), b.check_in));
    leadSum += lt;
    bump(lead, bucket(LEAD_BUCKETS, lt));
    losSum += b.nights;
    bump(los, bucket(LOS_BUCKETS, b.nights));
    party += b.adults + b.children;
    if (b.nationality) bump(nat, b.nationality.toUpperCase());
    if (b.promo_code) {
      const p = promos.get(b.promo_code) ?? { bookings: 0, discount: 0 };
      p.bookings++;
      p.discount += Number(b.discount_omr);
      promos.set(b.promo_code, p);
    }
  }
  const liveIds = new Set(live.map((b) => b.id));
  const addons = new Map<string, { quantity: number; revenue: number; bookings: Set<string> }>();
  for (const l of addonLines) {
    if (l.status === "cancelled" || !liveIds.has(l.booking_id)) continue;
    const a = addons.get(l.addon_id) ?? { quantity: 0, revenue: 0, bookings: new Set<string>() };
    a.quantity += l.quantity;
    a.revenue += Number(l.total_omr);
    a.bookings.add(l.booking_id);
    addons.set(l.addon_id, a);
  }
  const n = bookings.length;
  return {
    bookings: n,
    live: live.length,
    cancelled,
    noShow,
    cancellationRate: n ? (cancelled + noShow) / n : 0,
    bookedValue: roundOmr(live.reduce((a, b) => a + Number(b.total_omr), 0)),
    bySource: Array.from(src.entries()).map(([key, v]) => ({ key, bookings: v.bookings, value: roundOmr(v.value) })).sort((a, b) => b.bookings - a.bookings),
    avgLeadTime: live.length ? leadSum / live.length : 0,
    leadTime: Array.from(lead.entries()).map(([key, value]) => ({ key, value })),
    avgLengthOfStay: live.length ? losSum / live.length : 0,
    lengthOfStay: Array.from(los.entries()).map(([key, value]) => ({ key, value })),
    avgPartySize: live.length ? party / live.length : 0,
    addons: Array.from(addons.entries()).map(([addon_id, a]) => ({ addon_id, quantity: a.quantity, revenue: roundOmr(a.revenue), bookings: a.bookings.size })).sort((a, b) => b.revenue - a.revenue),
    promos: Array.from(promos.entries()).map(([code, p]) => ({ code, bookings: p.bookings, discount: roundOmr(p.discount) })).sort((a, b) => b.bookings - a.bookings),
    nationalities: rank(nat),
  };
}
