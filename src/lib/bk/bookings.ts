import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { BkBooking, BkRoomType, BkRoom, BkScheduledMessage, BkMessageLog, Json } from "@/lib/database.types";

// Booking writes always go through the SECURITY DEFINER RPCs with the service
// role. Reads for the guest confirmation page also use the service role but
// are gated by the HMAC token (see booking-engine/tokens.ts).

export interface CreateBookingInput {
  room_type_id: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  guest_name: string;
  guest_phone: string; // E.164
  guest_email?: string | null;
  nationality?: string | null;
  preferred_lang: "en" | "ar";
  special_requests?: string | null;
  internal_notes?: string | null;
  promo_code?: string | null;
  source?: "website" | "staff" | "phone" | "walk_in" | "ota";
  status?: "pending" | "confirmed";
  room_id?: string | null;
  created_by?: string | null;
}

export type CreateBookingError =
  | "sold_out"
  | "min_stay"
  | "capacity_exceeded"
  | "invalid_dates"
  | "past_date"
  | "too_far_ahead"
  | "invalid_phone"
  | "guest_name_required"
  | "room_type_not_found"
  | "room_unavailable"
  | "room_invalid"
  | "unknown";

const KNOWN_ERRORS: CreateBookingError[] = [
  "sold_out",
  "min_stay",
  "capacity_exceeded",
  "invalid_dates",
  "past_date",
  "too_far_ahead",
  "invalid_phone",
  "guest_name_required",
  "room_type_not_found",
  "room_unavailable",
  "room_invalid",
];

export function mapBookingError(message: string): CreateBookingError {
  return KNOWN_ERRORS.find((k) => message.includes(k)) ?? "unknown";
}

export async function createBooking(
  input: CreateBookingInput
): Promise<{ booking: BkBooking; error: null } | { booking: null; error: CreateBookingError; detail: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("bk_create_booking", { p: input as unknown as Json });
  if (error) return { booking: null, error: mapBookingError(error.message), detail: error.message };
  return { booking: data as unknown as BkBooking, error: null };
}

export async function cancelBooking(
  bookingId: string,
  reason: string | null,
  actorUserId: string | null
): Promise<{ booking: BkBooking; error: null } | { booking: null; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("bk_cancel_booking", {
    p_booking_id: bookingId,
    p_reason: reason ?? undefined,
    p_actor: actorUserId ?? undefined,
  });
  if (error) return { booking: null, error: error.message };
  return { booking: data as unknown as BkBooking, error: null };
}

export interface BookingWithRelations extends BkBooking {
  room_type: BkRoomType | null;
  room: BkRoom | null;
}

export async function getBookingByRef(ref: string): Promise<BookingWithRelations | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bk_bookings")
    .select("*, room_type:bk_room_types(*), room:bk_rooms(*)")
    .eq("ref", ref.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new Error(`booking read failed: ${error.message}`);
  return (data as unknown as BookingWithRelations) ?? null;
}

export async function getBookingById(id: string): Promise<BookingWithRelations | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bk_bookings")
    .select("*, room_type:bk_room_types(*), room:bk_rooms(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`booking read failed: ${error.message}`);
  return (data as unknown as BookingWithRelations) ?? null;
}

export async function getBookingMessages(bookingId: string): Promise<{
  scheduled: BkScheduledMessage[];
  log: BkMessageLog[];
}> {
  const admin = createAdminClient();
  const [s, l] = await Promise.all([
    admin.from("bk_scheduled_messages").select("*").eq("booking_id", bookingId).order("send_at"),
    admin.from("bk_message_log").select("*").eq("booking_id", bookingId).order("created_at", { ascending: false }),
  ]);
  return { scheduled: s.data ?? [], log: l.data ?? [] };
}
