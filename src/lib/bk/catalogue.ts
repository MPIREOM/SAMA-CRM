import "server-only";

import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { BkRoomType } from "@/lib/database.types";
import type { AvailabilityRow, QuoteResult } from "./types";

// Public catalogue + availability reads for the guest site (anon key, RLS).

export const getRoomTypes = cache(async (): Promise<BkRoomType[]> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("bk_room_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`bk_room_types read failed: ${error.message}`);
  return data ?? [];
});

export const getRoomTypeBySlug = cache(async (slug: string): Promise<BkRoomType | null> => {
  const types = await getRoomTypes();
  return types.find((t) => t.slug === slug) ?? null;
});

export type AvailabilityError =
  | "invalid_dates"
  | "past_date"
  | "too_many_nights"
  | "unknown";

export async function searchAvailability(
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number
): Promise<{ rows: AvailabilityRow[]; error: null } | { rows: null; error: AvailabilityError }> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("bk_availability", {
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_adults: adults,
    p_children: children,
  });
  if (error) {
    const code = error.message;
    if (code.includes("invalid_dates")) return { rows: null, error: "invalid_dates" };
    if (code.includes("past_date")) return { rows: null, error: "past_date" };
    if (code.includes("too_many_nights")) return { rows: null, error: "too_many_nights" };
    return { rows: null, error: "unknown" };
  }
  const rows = (data ?? []).map((r) => ({
    room_type_id: r.room_type_id,
    slug: r.slug,
    available_count: Number(r.available_count),
    nightly: (Array.isArray(r.nightly) ? r.nightly : []) as { date: string; rate: number }[],
    room_subtotal: Number(r.room_subtotal),
    min_stay: Number(r.min_stay),
    min_stay_ok: Boolean(r.min_stay_ok),
    fits_capacity: Boolean(r.fits_capacity),
  }));
  return { rows, error: null };
}

export async function getQuote(params: {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  promoCode?: string | null;
}): Promise<{ quote: QuoteResult; error: null } | { quote: null; error: string }> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("bk_quote", {
    p_room_type_id: params.roomTypeId,
    p_check_in: params.checkIn,
    p_check_out: params.checkOut,
    p_adults: params.adults,
    p_children: params.children,
    p_promo_code: params.promoCode ?? undefined,
  });
  if (error) return { quote: null, error: error.message };
  const q = data as unknown as QuoteResult;
  return {
    quote: {
      ...q,
      room_subtotal: Number(q.room_subtotal),
      discount: Number(q.discount),
      discount_pct: Number(q.discount_pct),
      service_charge: Number(q.service_charge),
      tourism_fee: Number(q.tourism_fee),
      vat: Number(q.vat),
      total: Number(q.total),
      available_count: Number(q.available_count),
      min_stay: Number(q.min_stay),
      nightly: (q.nightly ?? []).map((n) => ({ date: n.date, rate: Number(n.rate) })),
    },
    error: null,
  };
}
