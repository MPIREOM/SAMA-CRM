import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { addDaysIso, daysBetween, type AddonLine, type BookingRow, type WebEvent } from "./stats";

type Admin = ReturnType<typeof createAdminClient>;

const PAGE = 1000; // PostgREST max rows per request
const MAX_ROWS = 200_000;

/** Page through a PostgREST query (callers pass a builder for one page). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const { data, error } = await page(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Muscat midnight at the start of `date`, as an ISO instant. */
export function muscatStart(date: string): string {
  return `${date}T00:00:00+04:00`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const RANGE_PRESETS = ["7d", "30d", "90d", "mtd", "next30", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** Resolve ?range=&from=&to= into an inclusive date range (max 366 days). */
export function resolveRange(params: { range?: string; from?: string; to?: string }, today: string): { preset: RangePreset; from: string; to: string } {
  const preset = (RANGE_PRESETS as readonly string[]).includes(params.range ?? "") ? (params.range as RangePreset) : "30d";
  if (preset === "custom" && params.from && params.to && ISO.test(params.from) && ISO.test(params.to)) {
    let { from, to } = params;
    if (to < from) [from, to] = [to, from];
    if (daysBetween(from, to) > 365) from = addDaysIso(to, -365);
    return { preset, from, to };
  }
  if (preset === "7d") return { preset, from: addDaysIso(today, -6), to: today };
  if (preset === "90d") return { preset, from: addDaysIso(today, -89), to: today };
  if (preset === "mtd") return { preset, from: `${today.slice(0, 8)}01`, to: today };
  if (preset === "next30") return { preset, from: today, to: addDaysIso(today, 29) };
  return { preset: preset === "custom" ? "30d" : preset, from: addDaysIso(today, -29), to: today };
}

const BOOKING_COLS =
  "id, ref, status, source, room_type_id, check_in, check_out, nights, adults, children, nightly_rates, room_subtotal_omr, discount_omr, addons_omr, service_charge_omr, tourism_fee_omr, vat_omr, total_omr, promo_code, nationality, created_at";

export async function loadWebEvents(admin: Admin, from: string, to: string): Promise<WebEvent[]> {
  return fetchAll<WebEvent>((a, b) =>
    admin
      .from("bk_web_events")
      .select("created_at, kind, visitor_id, session_id, path, page_type, locale, source, country, device, browser, room_slug")
      .gte("created_at", muscatStart(from))
      .lt("created_at", muscatStart(addDaysIso(to, 1)))
      .order("id")
      .range(a, b),
  );
}

/** Bookings with at least one night in [from, to]. */
export async function loadStays(admin: Admin, from: string, to: string): Promise<BookingRow[]> {
  return fetchAll<BookingRow>((a, b) => admin.from("bk_bookings").select(BOOKING_COLS).lte("check_in", to).gt("check_out", from).order("check_in").order("id").range(a, b));
}

/** Bookings made (created) on Muscat dates from..to, with their add-on lines. */
export async function loadBookingsMade(admin: Admin, from: string, to: string): Promise<{ bookings: BookingRow[]; addons: AddonLine[] }> {
  const rows = await fetchAll<BookingRow & { addons: AddonLine[] | null }>((a, b) =>
    admin
      .from("bk_bookings")
      .select(`${BOOKING_COLS}, addons:bk_booking_addons(booking_id, addon_id, quantity, total_omr, status)`)
      .gte("created_at", muscatStart(from))
      .lt("created_at", muscatStart(addDaysIso(to, 1)))
      .order("created_at")
      .order("id")
      .range(a, b),
  );
  return { bookings: rows.map(({ addons: _a, ...b }) => b), addons: rows.flatMap((r) => r.addons ?? []) };
}

export async function loadCatalog(admin: Admin) {
  const [types, rooms, addons] = await Promise.all([
    admin.from("bk_room_types").select("id, slug, name_en, name_ar, sort_order").order("sort_order"),
    admin.from("bk_rooms").select("room_type_id").eq("status", "active"),
    admin.from("bk_addons").select("id, name_en, name_ar").order("sort_order"),
  ]);
  if (types.error) throw new Error(types.error.message);
  if (rooms.error) throw new Error(rooms.error.message);
  if (addons.error) throw new Error(addons.error.message);
  const roomsByType = new Map<string, number>((types.data ?? []).map((t) => [t.id, 0]));
  for (const r of rooms.data ?? []) roomsByType.set(r.room_type_id, (roomsByType.get(r.room_type_id) ?? 0) + 1);
  return { types: types.data ?? [], roomsByType, addons: addons.data ?? [] };
}
