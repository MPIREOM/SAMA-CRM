// Pricing math — TypeScript mirror of the Postgres functions bk_effective_rate,
// bk_nightly_rates and bk_quote (supabase/migrations/0005_booking_engine.sql).
// The database is the source of truth for every stored booking; this mirror
// powers instant UI previews and the unit tests that pin the rules down.
//
// Money is OMR with 3 decimals (baisa). Every intermediate value is rounded
// to 3 dp exactly like `round(x, 3)` in Postgres (half away from zero).

export interface TaxSettings {
  service_charge_pct: number;
  service_charge_enabled: boolean;
  tourism_fee_pct: number;
  tourism_fee_enabled: boolean;
  vat_pct: number;
  vat_enabled: boolean;
  /** VAT base = room + service charge + tourism fee when true. */
  vat_on_fees: boolean;
}

export const DEFAULT_TAXES: TaxSettings = {
  service_charge_pct: 8,
  service_charge_enabled: true,
  tourism_fee_pct: 4,
  tourism_fee_enabled: true,
  vat_pct: 5,
  vat_enabled: true,
  vat_on_fees: true,
};

export interface RatePlanLike {
  room_type_id: string | null;
  start_date: string; // YYYY-MM-DD inclusive
  end_date: string; // YYYY-MM-DD inclusive
  rate_omr: number | null;
  adjust_pct: number | null;
  min_stay: number;
  days_of_week: number[] | null; // 0=Sun … 6=Sat
  priority: number;
  is_active: boolean;
  created_at?: string;
}

export interface NightlyRate {
  date: string;
  rate: number;
}

export interface Quote {
  nights: number;
  nightly: NightlyRate[];
  room_subtotal: number;
  discount_pct: number;
  discount: number;
  service_charge: number;
  tourism_fee: number;
  vat: number;
  total: number;
}

/** Postgres-compatible round(x, 3): half away from zero. */
export function roundOmr(value: number): number {
  const factor = 1000;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  // Nudge by a tiny epsilon to counter binary float artefacts (e.g. 1.0005 → 1.000499…).
  return (sign * Math.round(abs * factor + 1e-9)) / factor;
}

/** Format OMR with 3 decimals, e.g. 165.11 → "165.110". */
export function formatOmr(value: number): string {
  return roundOmr(value).toFixed(3);
}

/** Add n days to a YYYY-MM-DD string using pure UTC date math. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calendar nights between two YYYY-MM-DD dates (0 when invalid/negative). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** 0 = Sunday … 6 = Saturday, same as Postgres extract(dow). */
export function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Every date in [checkIn, checkOut). */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const n = nightsBetween(checkIn, checkOut);
  for (let i = 0; i < n; i++) out.push(addDays(checkIn, i));
  return out;
}

/** The winning rate plan for a room type on one date (mirrors the SQL ORDER BY). */
export function winningPlan(
  plans: RatePlanLike[],
  roomTypeId: string,
  date: string
): RatePlanLike | null {
  const dow = dayOfWeek(date);
  const matching = plans.filter(
    (p) =>
      p.is_active &&
      (p.room_type_id === roomTypeId || p.room_type_id === null) &&
      date >= p.start_date &&
      date <= p.end_date &&
      (p.days_of_week === null || p.days_of_week.includes(dow))
  );
  if (matching.length === 0) return null;
  matching.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aSpecific = a.room_type_id !== null ? 1 : 0;
    const bSpecific = b.room_type_id !== null ? 1 : 0;
    if (bSpecific !== aSpecific) return bSpecific - aSpecific;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
  return matching[0];
}

export function effectiveRate(
  baseRate: number,
  plans: RatePlanLike[],
  roomTypeId: string,
  date: string
): number {
  const plan = winningPlan(plans, roomTypeId, date);
  if (!plan) return roundOmr(baseRate);
  if (plan.rate_omr !== null) return roundOmr(plan.rate_omr);
  return roundOmr(baseRate * (1 + (plan.adjust_pct ?? 0) / 100));
}

export function minStay(plans: RatePlanLike[], roomTypeId: string, checkIn: string): number {
  return winningPlan(plans, roomTypeId, checkIn)?.min_stay ?? 1;
}

export function nightlyRates(
  baseRate: number,
  plans: RatePlanLike[],
  roomTypeId: string,
  checkIn: string,
  checkOut: string
): NightlyRate[] {
  return nightsOf(checkIn, checkOut).map((date) => ({
    date,
    rate: effectiveRate(baseRate, plans, roomTypeId, date),
  }));
}

/** Itemised totals from nightly rates — identical to bk_quote. */
export function quoteFromNightly(
  nightly: NightlyRate[],
  taxes: TaxSettings = DEFAULT_TAXES,
  discountPct = 0
): Quote {
  const subtotal = roundOmr(nightly.reduce((s, n) => s + n.rate, 0));
  const discount = discountPct > 0 ? roundOmr((subtotal * discountPct) / 100) : 0;
  const taxable = subtotal - discount;
  const service = taxes.service_charge_enabled
    ? roundOmr((taxable * taxes.service_charge_pct) / 100)
    : 0;
  const tourism = taxes.tourism_fee_enabled
    ? roundOmr((taxable * taxes.tourism_fee_pct) / 100)
    : 0;
  let vat = 0;
  if (taxes.vat_enabled) {
    const base = taxes.vat_on_fees ? taxable + service + tourism : taxable;
    vat = roundOmr((base * taxes.vat_pct) / 100);
  }
  const total = roundOmr(taxable + service + tourism + vat);
  return {
    nights: nightly.length,
    nightly,
    room_subtotal: subtotal,
    discount_pct: discountPct,
    discount,
    service_charge: service,
    tourism_fee: tourism,
    vat,
    total,
  };
}

export function quote(
  baseRate: number,
  plans: RatePlanLike[],
  roomTypeId: string,
  checkIn: string,
  checkOut: string,
  taxes: TaxSettings = DEFAULT_TAXES,
  discountPct = 0
): Quote {
  return quoteFromNightly(
    nightlyRates(baseRate, plans, roomTypeId, checkIn, checkOut),
    taxes,
    discountPct
  );
}

/** Overlap rule used everywhere: existing.check_in < new.check_out && existing.check_out > new.check_in. */
export function overlaps(
  aIn: string,
  aOut: string,
  bIn: string,
  bOut: string
): boolean {
  return aIn < bOut && aOut > bIn;
}
