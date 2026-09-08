// RPCs mirrored from supabase/migrations/0005_booking_engine.sql (+ the
// add-on parameters from 0010). Error text is identical to the SQL
// `raise exception` messages so the app's mapBookingError() /
// searchAvailability() branches behave the same way.
// Pricing goes through the TS mirror in src/lib/booking-engine/pricing.ts.

import { muscatToday } from "../../src/lib/booking-engine/dates";
import {
  addDays,
  effectiveRate,
  minStay as minStayFor,
  nightlyRates,
  nightsBetween,
  nightsOf,
  quoteFromNightly,
  roundOmr,
  DEFAULT_TAXES,
  type RatePlanLike,
  type TaxSettings,
} from "../../src/lib/booking-engine/pricing";
import { Db, DbError, isIsoDate, isUuid, type Row } from "./db";

type Args = Record<string, unknown>;

export type Role = "anon" | "authenticated" | "service_role";

export interface RpcContext {
  role: Role;
  /** auth.uid() for authenticated callers. */
  userId: string | null;
}

/** EXECUTE grants from the migration. */
const GRANTS: Record<string, Role[]> = {
  bk_availability: ["anon", "authenticated", "service_role"],
  bk_quote: ["anon", "authenticated", "service_role"],
  bk_public_settings: ["anon", "authenticated", "service_role"],
  bk_effective_rate: ["anon", "authenticated", "service_role"],
  bk_nightly_rates: ["anon", "authenticated", "service_role"],
  bk_min_stay: ["anon", "authenticated", "service_role"],
  bk_muscat_today: ["anon", "authenticated", "service_role"],
  bk_available_count: ["authenticated", "service_role"],
  bk_create_booking: ["authenticated", "service_role"],
  bk_cancel_booking: ["authenticated", "service_role"],
  bk_send_at: ["authenticated", "service_role"],
  my_role: ["authenticated", "service_role"],
};

const invalid = (msg: string) => new DbError("22023", msg);
const raise = (msg: string) => new DbError("P0001", msg);

function toDate(v: unknown, param: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (!isIsoDate(s.slice(0, 10)) || (s.length > 10 && Number.isNaN(Date.parse(s)))) {
    throw new DbError("22007", `invalid input syntax for type date: "${s}"`, `parameter ${param}`);
  }
  return s.slice(0, 10);
}

function toUuid(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (!isUuid(v)) throw new DbError("22P02", `invalid input syntax for type uuid: "${String(v)}"`);
  return String(v).toLowerCase();
}

function toInt(v: unknown, fallback: number | null): number | null {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new DbError("22P02", `invalid input syntax for type integer: "${String(v)}"`);
  return n;
}

function plans(db: Db): RatePlanLike[] {
  return db.rows("bk_rate_plans").map((p) => ({
    room_type_id: (p.room_type_id as string | null) ?? null,
    start_date: String(p.start_date),
    end_date: String(p.end_date),
    rate_omr: p.rate_omr === null ? null : Number(p.rate_omr),
    adjust_pct: p.adjust_pct === null ? null : Number(p.adjust_pct),
    min_stay: Number(p.min_stay),
    days_of_week: (p.days_of_week as number[] | null) ?? null,
    priority: Number(p.priority),
    is_active: Boolean(p.is_active),
    created_at: String(p.created_at),
  }));
}

function taxes(db: Db): TaxSettings {
  const t = db.setting("taxes") ?? {};
  return {
    service_charge_pct: Number(t.service_charge_pct ?? DEFAULT_TAXES.service_charge_pct),
    service_charge_enabled: Boolean(t.service_charge_enabled ?? DEFAULT_TAXES.service_charge_enabled),
    tourism_fee_pct: Number(t.tourism_fee_pct ?? DEFAULT_TAXES.tourism_fee_pct),
    tourism_fee_enabled: Boolean(t.tourism_fee_enabled ?? DEFAULT_TAXES.tourism_fee_enabled),
    vat_pct: Number(t.vat_pct ?? DEFAULT_TAXES.vat_pct),
    vat_enabled: Boolean(t.vat_enabled ?? DEFAULT_TAXES.vat_enabled),
    vat_on_fees: Boolean(t.vat_on_fees ?? DEFAULT_TAXES.vat_on_fees),
  };
}

function roomType(db: Db, id: string | null): Row | null {
  if (!id) return null;
  return db.rows("bk_room_types").find((t) => t.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// helpers mirrored 1:1
// ---------------------------------------------------------------------------

export function bkEffectiveRate(db: Db, roomTypeId: string, date: string): number | null {
  const rt = roomType(db, roomTypeId);
  if (!rt) return null;
  return effectiveRate(Number(rt.base_rate_omr), plans(db), roomTypeId, date);
}

export function bkMinStay(db: Db, roomTypeId: string, checkIn: string): number {
  return minStayFor(plans(db), roomTypeId, checkIn);
}

export function bkNightlyRates(db: Db, roomTypeId: string, checkIn: string, checkOut: string): { date: string; rate: number | null }[] {
  const rt = roomType(db, roomTypeId);
  if (!rt) return nightsOf(checkIn, checkOut).map((date) => ({ date, rate: null }));
  return nightlyRates(Number(rt.base_rate_omr), plans(db), roomTypeId, checkIn, checkOut);
}

/** bk_available_count(): min over nights of active rooms − room blocks − type stop-sells − live bookings. */
export function bkAvailableCount(db: Db, roomTypeId: string, checkIn: string, checkOut: string, excludeBooking: string | null): number {
  const rooms = db.rows("bk_rooms").filter((r) => r.room_type_id === roomTypeId && r.status === "active");
  const total = rooms.length;
  if (total === 0) return 0;
  const activeIds = new Set(rooms.map((r) => r.id as string));
  const blocks = db.rows("bk_inventory_blocks");
  const bookings = db.rows("bk_bookings");
  let min = total;
  for (const night of nightsOf(checkIn, checkOut)) {
    const stopSell = blocks.some((b) => b.room_type_id === roomTypeId && b.room_id === null && String(b.start_date) <= night && String(b.end_date) > night);
    if (stopSell) return 0;
    const blockedRooms = new Set(
      blocks
        .filter((b) => b.room_id !== null && activeIds.has(b.room_id as string) && String(b.start_date) <= night && String(b.end_date) > night)
        .map((b) => b.room_id as string)
    );
    const booked = bookings.filter(
      (k) =>
        k.room_type_id === roomTypeId &&
        k.status !== "cancelled" &&
        k.status !== "no_show" &&
        (excludeBooking === null || k.id !== excludeBooking) &&
        String(k.check_in) <= night &&
        String(k.check_out) > night
    ).length;
    const avail = total - blockedRooms.size - booked;
    if (avail < min) min = avail;
    if (min <= 0) return 0;
  }
  return Math.max(min, 0);
}

function bkPublicSettings(db: Db): Row {
  const keys = ["times", "cancellation", "contact", "booking", "taxes", "reviews", "hotel"];
  const out: Row = {};
  for (const row of db.rows("bk_settings")) if (keys.includes(String(row.key))) out[String(row.key)] = row.value;
  return out;
}

function bkAvailability(db: Db, a: Args): Row[] {
  const checkIn = toDate(a.p_check_in, "p_check_in");
  const checkOut = toDate(a.p_check_out, "p_check_out");
  const adults = toInt(a.p_adults, 2);
  const children = toInt(a.p_children, 0);
  const maxNights = Number(db.setting("booking")?.max_nights ?? 30);
  if (!checkIn || !checkOut || checkOut <= checkIn) throw invalid("invalid_dates");
  if (checkIn < muscatToday()) throw invalid("past_date");
  if (nightsBetween(checkIn, checkOut) > maxNights) throw invalid("too_many_nights");
  const nights = nightsBetween(checkIn, checkOut);
  return db
    .rows("bk_room_types")
    .filter((rt) => rt.is_active === true)
    .sort((x, y) => Number(x.sort_order) - Number(y.sort_order) || String(x.name_en).localeCompare(String(y.name_en)))
    .map((rt) => {
      const id = rt.id as string;
      const nightly = bkNightlyRates(db, id, checkIn, checkOut);
      const ms = bkMinStay(db, id, checkIn);
      return {
        room_type_id: id,
        slug: rt.slug,
        available_count: bkAvailableCount(db, id, checkIn, checkOut, null),
        nightly,
        room_subtotal: roundOmr(nightly.reduce((s, n) => s + (n.rate ?? 0), 0)),
        min_stay: ms,
        min_stay_ok: nights >= ms,
        fits_capacity: (adults ?? 2) <= Number(rt.max_adults) && (children ?? 0) <= Number(rt.max_children),
      };
    });
}

/** One priced add-on line — the `addons` entries bk_quote returns (migration 0010). */
interface AddonQuoteLine extends Row {
  addon_id: string;
  slug: string;
  kind: string;
  name_en: string;
  name_ar: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total: number;
  taxable: boolean;
  note: string | null;
}

/**
 * Resolve `p_addons = [{slug|addon_id, quantity, note}]` against the catalogue.
 * Prices always come from bk_addons, never from the caller; per_night lines
 * multiply by the number of nights. Mirrors the loop in bk_quote (0010).
 */
function resolveAddons(db: Db, raw: unknown, nights: number): AddonQuoteLine[] {
  if (!Array.isArray(raw)) return [];
  const out: AddonQuoteLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const it = item as Row;
    const qty = Number(it.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const addonId = it.addon_id === undefined || it.addon_id === null ? null : String(it.addon_id).toLowerCase();
    const slug = it.slug === undefined || it.slug === null ? null : String(it.slug);
    const ad = db.rows("bk_addons").find((x) => x.is_active === true && ((addonId !== null && x.id === addonId) || (slug !== null && x.slug === slug)));
    if (!ad) throw invalid("addon_not_found");
    if (qty > Number(ad.max_quantity)) throw invalid("addon_quantity");
    const unit = String(ad.unit);
    const unitPrice = Number(ad.price_omr);
    const total = roundOmr(unit === "per_night" ? unitPrice * qty * nights : unitPrice * qty);
    out.push({
      addon_id: String(ad.id),
      slug: String(ad.slug),
      kind: String(ad.kind),
      name_en: String(ad.name_en),
      name_ar: String(ad.name_ar),
      unit,
      quantity: qty,
      unit_price: unitPrice,
      total,
      taxable: ad.taxable === true,
      note: it.note === undefined || it.note === null ? null : String(it.note),
    });
  }
  return out;
}

function bkQuote(db: Db, a: Args): Row {
  const roomTypeId = toUuid(a.p_room_type_id);
  const checkIn = toDate(a.p_check_in, "p_check_in");
  const checkOut = toDate(a.p_check_out, "p_check_out");
  const adults = toInt(a.p_adults, 2);
  const children = toInt(a.p_children, 0);
  const promoRaw = a.p_promo_code === undefined || a.p_promo_code === null ? null : String(a.p_promo_code);
  const rt = roomType(db, roomTypeId);
  if (!rt || rt.is_active !== true) throw invalid("room_type_not_found");
  if (!checkIn || !checkOut || checkOut <= checkIn) throw invalid("invalid_dates");
  const id = rt.id as string;

  const nightly = nightlyRates(Number(rt.base_rate_omr), plans(db), id, checkIn, checkOut);
  const addonLines = resolveAddons(db, a.p_addons, nightsBetween(checkIn, checkOut));

  let promoValid = false;
  let discountPct = 0;
  if (promoRaw && promoRaw.trim().length > 0) {
    const codes = db.setting("promo")?.codes;
    const list = Array.isArray(codes) ? (codes as Row[]) : [];
    const today = muscatToday();
    const code = list.find(
      (c) =>
        String(c.code ?? "").toUpperCase() === promoRaw.trim().toUpperCase() &&
        (c.enabled === undefined || c.enabled === null || c.enabled === true) &&
        (c.valid_until === undefined || c.valid_until === null || String(c.valid_until) >= today)
    );
    if (code) {
      promoValid = true;
      discountPct = Number(code.percent ?? 0);
    }
  }
  const t = taxes(db);
  const q = quoteFromNightly(
    nightly,
    t,
    discountPct,
    addonLines.map((l) => ({ quantity: l.quantity, unit_price: l.unit_price, unit: l.unit as "per_person" | "per_car" | "per_booking" | "per_night", taxable: l.taxable }))
  );
  return {
    room_type_id: id,
    slug: rt.slug,
    check_in: checkIn,
    check_out: checkOut,
    nights: nightsBetween(checkIn, checkOut),
    adults,
    children,
    nightly: q.nightly,
    room_subtotal: q.room_subtotal,
    promo_code: promoValid ? promoRaw!.trim().toUpperCase() : null,
    promo_valid: promoValid,
    discount_pct: discountPct,
    discount: q.discount,
    addons: addonLines,
    addons_total: q.addons_total,
    service_charge: q.service_charge,
    tourism_fee: q.tourism_fee,
    vat: q.vat,
    total: q.total,
    taxes: t,
    available_count: bkAvailableCount(db, id, checkIn, checkOut, null),
    min_stay: bkMinStay(db, id, checkIn),
    fits_capacity: (adults ?? 2) <= Number(rt.max_adults) && (children ?? 0) <= Number(rt.max_children),
  };
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function muscatYY(): string {
  return muscatToday().slice(2, 4);
}

function generateRef(db: Db): string {
  for (;;) {
    let ref = `SAMA-${muscatYY()}-`;
    for (let i = 0; i < 6; i++) ref += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
    const taken = db.rows("bk_bookings").some((b) => b.ref === ref) || db.rows("bookings").some((b) => b.ref === ref);
    if (!taken) return ref;
  }
}

const trimOrNull = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/** bk_upsert_contact(): find by phone, update non-empty fields, never touch consent. */
function upsertContact(db: Db, name: string, phone: string, email: string | null, lang: string, nationality: unknown): string {
  const existing = db.rows("contacts").find((c) => c.phone === phone);
  if (existing) {
    db.update(
      "contacts",
      {
        name: trimOrNull(name) ?? existing.name,
        email: trimOrNull(email) ?? existing.email,
        lang: lang ?? existing.lang,
        nationality: trimOrNull(nationality) ?? existing.nationality,
      },
      (r) => r === existing
    );
    return existing.id as string;
  }
  const [row] = db.insert("contacts", [
    {
      name: trimOrNull(name) ?? phone,
      phone,
      email: trimOrNull(email),
      lang: lang ?? "ar",
      nationality: trimOrNull(nationality),
      consent: false,
      tags: ["website"],
    },
  ]);
  return row.id as string;
}

/** bk_schedule_booking_messages(): six rows, idempotent. */
function scheduleMessages(db: Db, bookingId: string): void {
  const b = db.rows("bk_bookings").find((r) => r.id === bookingId);
  if (!b) return;
  for (const kind of ["confirmation", "pre_arrival", "post_stay"]) {
    for (const channel of ["email", "whatsapp"]) {
      db.insert(
        "bk_scheduled_messages",
        [
          {
            booking_id: bookingId,
            channel,
            kind,
            send_at: db.sendAt(kind, String(b.check_in), String(b.check_out)),
            status: channel === "email" && (b.guest_email === null || b.guest_email === "") ? "skipped" : "pending",
          },
        ],
        { onConflict: ["booking_id", "channel", "kind"], resolution: "ignore" }
      );
    }
  }
}

function bkCreateBooking(db: Db, a: Args): Row {
  const p = (a.p ?? {}) as Args;
  if (!p || typeof p !== "object") throw new DbError("22023", "invalid_payload");
  const checkIn = toDate(p.check_in, "check_in");
  const checkOut = toDate(p.check_out, "check_out");
  const adults = toInt(p.adults, 2) ?? 2;
  const children = toInt(p.children, 0) ?? 0;
  const lang = p.preferred_lang === "ar" ? "ar" : "en";
  const source = p.source === undefined || p.source === null ? "website" : String(p.source);
  const phone = p.guest_phone === undefined || p.guest_phone === null ? null : String(p.guest_phone);
  const email = trimOrNull(p.guest_email);
  const name = String(p.guest_name ?? "").trim();
  const status = p.status === undefined || p.status === null ? "confirmed" : String(p.status);
  const roomId = toUuid(p.room_id);
  const maxAdvance = Number(db.setting("booking")?.max_advance_days ?? 365);
  const today = muscatToday();

  if (name === "") throw invalid("guest_name_required");
  if (!phone || !/^\+[1-9][0-9]{6,14}$/.test(phone)) throw invalid("invalid_phone");
  if (!checkIn || !checkOut || checkOut <= checkIn) throw invalid("invalid_dates");
  if (source === "website" && checkIn < today) throw invalid("past_date");
  if (checkIn > addDays(today, maxAdvance)) throw invalid("too_far_ahead");

  const rt = roomType(db, toUuid(p.room_type_id));
  if (!rt || rt.is_active !== true) throw invalid("room_type_not_found");
  const rtId = rt.id as string;
  if (source === "website" && (adults > Number(rt.max_adults) || children > Number(rt.max_children))) throw invalid("capacity_exceeded");

  // pg_advisory_xact_lock(hashtext(room_type_id)): this function is synchronous
  // end-to-end, so concurrent calls are serialised by the event loop.
  const avail = bkAvailableCount(db, rtId, checkIn, checkOut, null);
  if (avail <= 0) throw raise("sold_out");
  if (source === "website" && nightsBetween(checkIn, checkOut) < bkMinStay(db, rtId, checkIn)) throw invalid("min_stay");
  if (roomId !== null) {
    const room = db.rows("bk_rooms").find((r) => r.id === roomId && r.room_type_id === rtId && r.status === "active");
    if (!room) throw invalid("room_invalid");
    const clash =
      db.rows("bk_bookings").some((k) => k.room_id === roomId && k.status !== "cancelled" && k.status !== "no_show" && String(k.check_in) < checkOut && String(k.check_out) > checkIn) ||
      db.rows("bk_inventory_blocks").some((b) => b.room_id === roomId && String(b.start_date) < checkOut && String(b.end_date) > checkIn);
    if (clash) throw raise("room_unavailable");
  }

  const quote = bkQuote(db, {
    p_room_type_id: rtId,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_adults: adults,
    p_children: children,
    p_promo_code: p.promo_code ?? null,
    p_addons: p.addons ?? null,
  });
  const contactId = upsertContact(db, name, phone, email, lang, p.nationality);
  const ref = generateRef(db);

  const [booking] = db.insert("bk_bookings", [
    {
      ref,
      contact_id: contactId,
      guest_name: name,
      guest_email: email,
      guest_phone: phone,
      nationality: trimOrNull(p.nationality),
      preferred_lang: lang,
      room_type_id: rtId,
      room_id: roomId,
      check_in: checkIn,
      check_out: checkOut,
      adults,
      children,
      status,
      nightly_rates: quote.nightly,
      room_subtotal_omr: quote.room_subtotal,
      discount_omr: quote.discount,
      addons_omr: quote.addons_total,
      service_charge_omr: quote.service_charge,
      tourism_fee_omr: quote.tourism_fee,
      vat_omr: quote.vat,
      total_omr: quote.total,
      promo_code: quote.promo_code,
      special_requests: trimOrNull(p.special_requests),
      internal_notes: trimOrNull(p.internal_notes),
      source,
      created_by: toUuid(p.created_by),
    },
  ]);
  // Migration 0010: one bk_booking_addons row per priced line (status 'requested').
  for (const line of quote.addons as AddonQuoteLine[]) {
    db.insert("bk_booking_addons", [
      {
        booking_id: booking.id,
        addon_id: line.addon_id,
        quantity: line.quantity,
        unit_price_omr: line.unit_price,
        total_omr: line.total,
        taxable: line.taxable,
        note: trimOrNull(line.note),
      },
    ]);
  }
  scheduleMessages(db, booking.id as string);
  return { ...booking };
}

function bkCancelBooking(db: Db, a: Args): Row {
  const id = toUuid(a.p_booking_id);
  const reason = a.p_reason === undefined || a.p_reason === null ? null : String(a.p_reason);
  const actor = toUuid(a.p_actor);
  const b = id ? db.rows("bk_bookings").find((r) => r.id === id) : undefined;
  if (!b) throw invalid("booking_not_found");
  if (b.status === "cancelled" || b.status === "no_show" || b.status === "checked_out") throw invalid("not_cancellable");
  const previous = b.status;
  db.update("bk_bookings", { status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: trimOrNull(reason) }, (r) => r === b);
  db.insert("bk_audit_log", [
    {
      actor_user_id: actor,
      action: "booking.cancel",
      entity: "bk_bookings",
      entity_id: b.id,
      diff: { reason, previous_status: previous },
    },
  ]);
  return { ...b };
}

function myRole(db: Db, ctx: RpcContext): string | null {
  if (!ctx.userId) return null;
  const p = db.rows("profiles").find((r) => r.id === ctx.userId);
  return p ? String(p.role) : null;
}

// ---------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------

export function callRpc(db: Db, ctx: RpcContext, fn: string, args: Args): unknown {
  const allowed = GRANTS[fn];
  if (!allowed) {
    throw new DbError("PGRST202", `Could not find the function public.${fn} in the schema cache`, null, `Perhaps you meant to call the function public.bk_quote`, 404);
  }
  if (!allowed.includes(ctx.role)) {
    throw new DbError("42501", `permission denied for function ${fn}`, null, null, ctx.role === "anon" ? 401 : 403);
  }
  switch (fn) {
    case "bk_muscat_today":
      return muscatToday();
    case "bk_public_settings":
      return bkPublicSettings(db);
    case "bk_availability":
      return bkAvailability(db, args);
    case "bk_quote":
      return bkQuote(db, args);
    case "bk_effective_rate": {
      const id = toUuid(args.p_room_type_id);
      const d = toDate(args.p_date, "p_date");
      return id && d ? bkEffectiveRate(db, id, d) : null;
    }
    case "bk_nightly_rates": {
      const id = toUuid(args.p_room_type_id);
      const i = toDate(args.p_check_in, "p_check_in");
      const o = toDate(args.p_check_out, "p_check_out");
      return id && i && o ? bkNightlyRates(db, id, i, o) : [];
    }
    case "bk_min_stay": {
      const id = toUuid(args.p_room_type_id);
      const d = toDate(args.p_check_in, "p_check_in");
      return id && d ? bkMinStay(db, id, d) : 1;
    }
    case "bk_available_count": {
      const id = toUuid(args.p_room_type_id);
      const i = toDate(args.p_check_in, "p_check_in");
      const o = toDate(args.p_check_out, "p_check_out");
      if (!id || !i || !o) return null;
      return bkAvailableCount(db, id, i, o, toUuid(args.p_exclude_booking));
    }
    case "bk_send_at": {
      const i = toDate(args.p_check_in, "p_check_in");
      const o = toDate(args.p_check_out, "p_check_out");
      if (!i || !o) return null;
      return db.sendAt(String(args.p_kind), i, o);
    }
    case "bk_create_booking":
      return bkCreateBooking(db, args);
    case "bk_cancel_booking":
      return bkCancelBooking(db, args);
    case "my_role":
      return myRole(db, ctx);
    default:
      throw new DbError("PGRST202", `Could not find the function public.${fn} in the schema cache`, null, null, 404);
  }
}
