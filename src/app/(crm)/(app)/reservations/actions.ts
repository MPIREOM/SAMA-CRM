"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { cancelBooking, createBooking } from "@/lib/bk/bookings";
import { getQuote } from "@/lib/bk/catalogue";
import type { QuoteResult } from "@/lib/bk/types";
import { dispatchForBooking } from "@/lib/messaging/dispatch";
import { normalizePhone } from "@/lib/phone";
import { logger } from "@/lib/logger";
import { muscatToday } from "@/lib/booking-engine/dates";
import type { Json } from "@/lib/database.types";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";

// Every mutation: requireStaff → Zod → service-role write → audit → revalidate.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const uuid = z.string().uuid();

const PATHS = ["/reservations", "/calendar", "/dashboard"];
function revalidateBooking(id?: string) {
  for (const p of PATHS) revalidatePath(p);
  if (id) revalidatePath(`/reservations/${id}`);
}

async function loadBooking(id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("bk_bookings").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("booking_not_found");
  return data;
}

/** Overlap rule re-checked with the service role before any room assignment. */
async function roomConflict(
  roomId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId: string | null
): Promise<boolean> {
  const admin = createAdminClient();
  let q = admin
    .from("bk_bookings")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .not("status", "in", "(cancelled,no_show)")
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);
  if (excludeBookingId) q = q.neq("id", excludeBookingId);
  const [bk, bl] = await Promise.all([
    q,
    admin
      .from("bk_inventory_blocks")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .lt("start_date", checkOut)
      .gt("end_date", checkIn),
  ]);
  if (bk.error) throw new Error(bk.error.message);
  if (bl.error) throw new Error(bl.error.message);
  return (bk.count ?? 0) > 0 || (bl.count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Room assignment
// ---------------------------------------------------------------------------

const AssignRoomSchema = z.object({ bookingId: uuid, roomId: uuid.nullable() });

export async function assignRoom(input: unknown): Promise<ActionResult> {
  return runAction("booking.assign_room", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { bookingId, roomId } = AssignRoomSchema.parse(input);
    const admin = createAdminClient();
    const booking = await loadBooking(bookingId);
    if (booking.status === "cancelled" || booking.status === "no_show" || booking.status === "checked_out") {
      return { ok: false, error: "not_cancellable" };
    }
    if (roomId) {
      const { data: room } = await admin.from("bk_rooms").select("id, room_type_id, status").eq("id", roomId).maybeSingle();
      if (!room || room.room_type_id !== booking.room_type_id || room.status !== "active") {
        return { ok: false, error: "room_invalid" };
      }
      if (await roomConflict(roomId, booking.check_in, booking.check_out, bookingId)) {
        return { ok: false, error: "overlap" };
      }
    }
    const { error } = await admin.from("bk_bookings").update({ room_id: roomId }).eq("id", bookingId);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "booking.assign_room", "bk_bookings", bookingId, { from: booking.room_id, to: roomId });
    revalidateBooking(bookingId);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

const IdSchema = z.object({ bookingId: uuid });

export async function confirmBooking(input: unknown): Promise<ActionResult> {
  return runAction("booking.confirm", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { bookingId } = IdSchema.parse(input);
    const booking = await loadBooking(bookingId);
    if (booking.status !== "pending") return { ok: false, error: "Only pending bookings can be confirmed." };
    const admin = createAdminClient();
    const { error } = await admin.from("bk_bookings").update({ status: "confirmed" }).eq("id", bookingId);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "booking.confirm", "bk_bookings", bookingId, { from: "pending", to: "confirmed" });
    revalidateBooking(bookingId);
    return { ok: true };
  });
}

export async function checkInBooking(input: unknown): Promise<ActionResult> {
  return runAction("booking.check_in", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { bookingId } = IdSchema.parse(input);
    const booking = await loadBooking(bookingId);
    if (booking.status !== "confirmed" && booking.status !== "pending") {
      return { ok: false, error: "Only confirmed or pending bookings can be checked in." };
    }
    if (!booking.room_id) return { ok: false, error: "Assign a room before checking in." };
    const admin = createAdminClient();
    const { error } = await admin
      .from("bk_bookings")
      .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
      .eq("id", bookingId);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "booking.check_in", "bk_bookings", bookingId, { from: booking.status, to: "checked_in" });
    revalidateBooking(bookingId);
    return { ok: true };
  });
}

export async function checkOutBooking(input: unknown): Promise<ActionResult> {
  return runAction("booking.check_out", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { bookingId } = IdSchema.parse(input);
    const booking = await loadBooking(bookingId);
    if (booking.status !== "checked_in") return { ok: false, error: "Only in-house guests can be checked out." };
    const admin = createAdminClient();
    const { error } = await admin
      .from("bk_bookings")
      .update({ status: "checked_out", checked_out_at: new Date().toISOString() })
      .eq("id", bookingId);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "booking.check_out", "bk_bookings", bookingId, { from: "checked_in", to: "checked_out" });
    revalidateBooking(bookingId);
    return { ok: true };
  });
}

export async function markNoShow(input: unknown): Promise<ActionResult> {
  return runAction("booking.no_show", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { bookingId } = IdSchema.parse(input);
    const booking = await loadBooking(bookingId);
    if (booking.status !== "confirmed" && booking.status !== "pending") {
      return { ok: false, error: "Only confirmed or pending bookings can be marked as no-show." };
    }
    if (booking.check_in > muscatToday()) return { ok: false, error: "The guest hasn't arrived yet — check-in is in the future." };
    const admin = createAdminClient();
    const { error } = await admin.from("bk_bookings").update({ status: "no_show" }).eq("id", bookingId);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "booking.no_show", "bk_bookings", bookingId, { from: booking.status, to: "no_show" });
    revalidateBooking(bookingId);
    return { ok: true };
  });
}

const CancelSchema = z.object({ bookingId: uuid, reason: z.string().trim().max(500).optional() });

export async function cancelBookingAction(input: unknown): Promise<ActionResult> {
  return runAction("booking.cancel", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { bookingId, reason } = CancelSchema.parse(input);
    // bk_cancel_booking writes its own audit row (booking.cancel) with the actor.
    const result = await cancelBooking(bookingId, reason ?? null, actor.userId);
    if (result.error) return { ok: false, error: result.error };
    revalidateBooking(bookingId);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Guest details
// ---------------------------------------------------------------------------

const GuestSchema = z.object({
  bookingId: uuid,
  guest_name: z.string().trim().min(1).max(120),
  guest_email: z.string().trim().email().max(200).or(z.literal("")).nullable(),
  guest_phone: z.string().trim().min(5).max(30),
  nationality: z.string().trim().max(80).nullable(),
  preferred_lang: z.enum(["en", "ar"]),
  special_requests: z.string().trim().max(2000).nullable(),
  internal_notes: z.string().trim().max(2000).nullable(),
});

export async function updateGuest(input: unknown): Promise<ActionResult> {
  return runAction("booking.update_guest", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const data = GuestSchema.parse(input);
    const phone = normalizePhone(data.guest_phone);
    if (!phone) return { ok: false, error: "invalid_phone" };
    const before = await loadBooking(data.bookingId);
    const patch = {
      guest_name: data.guest_name,
      guest_email: data.guest_email ? data.guest_email : null,
      guest_phone: phone,
      nationality: data.nationality || null,
      preferred_lang: data.preferred_lang,
      special_requests: data.special_requests || null,
      internal_notes: data.internal_notes || null,
    };
    const admin = createAdminClient();
    const { error } = await admin.from("bk_bookings").update(patch).eq("id", data.bookingId);
    if (error) return { ok: false, error: error.message };
    // An email added later un-skips the email messages that were skipped at creation.
    if (patch.guest_email && !before.guest_email) {
      await admin
        .from("bk_scheduled_messages")
        .update({ status: "pending" })
        .eq("booking_id", data.bookingId)
        .eq("channel", "email")
        .eq("status", "skipped");
    }
    const diff: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
      if (before[key] !== patch[key]) diff[key] = { from: before[key], to: patch[key] };
    }
    await audit(actor, "booking.update_guest", "bk_bookings", data.bookingId, diff);
    revalidateBooking(data.bookingId);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Dates / occupancy → re-check availability, re-quote, rewrite money columns
// ---------------------------------------------------------------------------

const DatesSchema = z.object({
  bookingId: uuid,
  check_in: isoDate,
  check_out: isoDate,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
});

export async function changeDates(input: unknown): Promise<ActionResult> {
  return runAction("booking.change_dates", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const data = DatesSchema.parse(input);
    if (data.check_out <= data.check_in) return { ok: false, error: "invalid_dates" };
    const before = await loadBooking(data.bookingId);
    if (before.status === "cancelled" || before.status === "no_show" || before.status === "checked_out") {
      return { ok: false, error: "This booking can no longer be changed." };
    }
    const admin = createAdminClient();
    const datesChanged = before.check_in !== data.check_in || before.check_out !== data.check_out;
    if (datesChanged) {
      const { data: available, error: availErr } = await admin.rpc("bk_available_count", {
        p_room_type_id: before.room_type_id,
        p_check_in: data.check_in,
        p_check_out: data.check_out,
        p_exclude_booking: data.bookingId,
      });
      if (availErr) return { ok: false, error: availErr.message };
      if ((available ?? 0) <= 0) return { ok: false, error: "sold_out" };
      if (before.room_id && (await roomConflict(before.room_id, data.check_in, data.check_out, data.bookingId))) {
        return { ok: false, error: "room_unavailable" };
      }
    }
    const { data: quoteJson, error: quoteErr } = await admin.rpc("bk_quote", {
      p_room_type_id: before.room_type_id,
      p_check_in: data.check_in,
      p_check_out: data.check_out,
      p_adults: data.adults,
      p_children: data.children,
      p_promo_code: before.promo_code ?? undefined,
    });
    if (quoteErr) return { ok: false, error: quoteErr.message };
    const q = quoteJson as unknown as QuoteResult;
    const { error } = await admin
      .from("bk_bookings")
      .update({
        check_in: data.check_in,
        check_out: data.check_out,
        adults: data.adults,
        children: data.children,
        nightly_rates: (q.nightly ?? []) as unknown as Json,
        room_subtotal_omr: Number(q.room_subtotal),
        discount_omr: Number(q.discount),
        service_charge_omr: Number(q.service_charge),
        tourism_fee_omr: Number(q.tourism_fee),
        vat_omr: Number(q.vat),
        total_omr: Number(q.total),
        promo_code: q.promo_valid ? q.promo_code : null,
      })
      .eq("id", data.bookingId);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "booking.change_dates", "bk_bookings", data.bookingId, {
      check_in: { from: before.check_in, to: data.check_in },
      check_out: { from: before.check_out, to: data.check_out },
      adults: { from: before.adults, to: data.adults },
      children: { from: before.children, to: data.children },
      total_omr: { from: before.total_omr, to: Number(q.total) },
    });
    revalidateBooking(data.bookingId);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Messaging: resend confirmation
// ---------------------------------------------------------------------------

const ResendSchema = z.object({ bookingId: uuid, channel: z.enum(["email", "whatsapp"]) });

export async function resendConfirmation(input: unknown): Promise<ActionResult> {
  return runAction("booking.resend_confirmation", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { bookingId, channel } = ResendSchema.parse(input);
    const booking = await loadBooking(bookingId);
    if (channel === "email" && !booking.guest_email) return { ok: false, error: "This booking has no email address." };
    const admin = createAdminClient();
    const { error } = await admin.from("bk_scheduled_messages").upsert(
      {
        booking_id: bookingId,
        channel,
        kind: "confirmation",
        status: "pending",
        send_at: new Date().toISOString(),
        attempts: 0,
        last_error: null,
        locked_at: null,
        sent_at: null,
      },
      { onConflict: "booking_id,channel,kind" }
    );
    if (error) return { ok: false, error: error.message };
    await audit(actor, "booking.resend_confirmation", "bk_bookings", bookingId, { channel });
    try {
      await dispatchForBooking(bookingId, ["confirmation"]);
    } catch (e) {
      logger.warn("booking.resend_confirmation", "dispatch failed; the cron will retry", { error: (e as Error).message });
    }
    revalidateBooking(bookingId);
    revalidatePath("/messaging");
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Staff booking form helpers
// ---------------------------------------------------------------------------

const QuoteSchema = z.object({
  roomTypeId: uuid,
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  promoCode: z.string().trim().max(40).optional().nullable(),
});

export async function quotePreview(input: unknown): Promise<ActionResult<QuoteResult>> {
  return runAction("booking.quote", async () => {
    await requireStaff(FRONT_DESK_ROLES);
    const data = QuoteSchema.parse(input);
    if (data.checkOut <= data.checkIn) return { ok: false, error: "invalid_dates" };
    const result = await getQuote(data);
    if (result.quote === null) return { ok: false, error: result.error };
    return { ok: true, data: result.quote };
  });
}

const FreeRoomsSchema = z.object({
  roomTypeId: uuid,
  checkIn: isoDate,
  checkOut: isoDate,
  excludeBookingId: uuid.nullable().optional(),
});

export type FreeRoom = { id: string; room_number: string; floor: string | null };

export async function freeRooms(input: unknown): Promise<ActionResult<FreeRoom[]>> {
  return runAction("booking.free_rooms", async () => {
    await requireStaff(FRONT_DESK_ROLES);
    const data = FreeRoomsSchema.parse(input);
    if (data.checkOut <= data.checkIn) return { ok: true, data: [] };
    const admin = createAdminClient();
    const [rooms, taken, blocked] = await Promise.all([
      admin
        .from("bk_rooms")
        .select("id, room_number, floor")
        .eq("room_type_id", data.roomTypeId)
        .eq("status", "active")
        .order("sort_order")
        .order("room_number"),
      admin
        .from("bk_bookings")
        .select("id, room_id")
        .eq("room_type_id", data.roomTypeId)
        .not("room_id", "is", null)
        .not("status", "in", "(cancelled,no_show)")
        .lt("check_in", data.checkOut)
        .gt("check_out", data.checkIn),
      admin
        .from("bk_inventory_blocks")
        .select("room_id")
        .not("room_id", "is", null)
        .lt("start_date", data.checkOut)
        .gt("end_date", data.checkIn),
    ]);
    if (rooms.error) return { ok: false, error: rooms.error.message };
    const busy = new Set<string>();
    for (const b of taken.data ?? []) if (b.room_id && b.id !== data.excludeBookingId) busy.add(b.room_id);
    for (const k of blocked.data ?? []) if (k.room_id) busy.add(k.room_id);
    return { ok: true, data: (rooms.data ?? []).filter((r) => !busy.has(r.id)) };
  });
}

const CreateSchema = z.object({
  room_type_id: uuid,
  check_in: isoDate,
  check_out: isoDate,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  guest_name: z.string().trim().min(1).max(120),
  guest_phone: z.string().trim().min(5).max(30),
  guest_email: z.string().trim().email().max(200).or(z.literal("")).optional().nullable(),
  nationality: z.string().trim().max(80).optional().nullable(),
  preferred_lang: z.enum(["en", "ar"]),
  source: z.enum(["staff", "phone", "walk_in", "ota"]),
  status: z.enum(["confirmed", "pending"]),
  room_id: uuid.optional().nullable(),
  promo_code: z.string().trim().max(40).optional().nullable(),
  special_requests: z.string().trim().max(2000).optional().nullable(),
  internal_notes: z.string().trim().max(2000).optional().nullable(),
});

export async function createStaffBooking(input: unknown): Promise<ActionResult<{ id: string; ref: string }>> {
  return runAction("booking.create", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const data = CreateSchema.parse(input);
    if (data.check_out <= data.check_in) return { ok: false, error: "invalid_dates" };
    const phone = normalizePhone(data.guest_phone);
    if (!phone) return { ok: false, error: "invalid_phone" };
    const result = await createBooking({
      room_type_id: data.room_type_id,
      check_in: data.check_in,
      check_out: data.check_out,
      adults: data.adults,
      children: data.children,
      guest_name: data.guest_name,
      guest_phone: phone,
      guest_email: data.guest_email || null,
      nationality: data.nationality || null,
      preferred_lang: data.preferred_lang,
      special_requests: data.special_requests || null,
      internal_notes: data.internal_notes || null,
      promo_code: data.promo_code || null,
      source: data.source,
      status: data.status,
      room_id: data.room_id || null,
      created_by: actor.userId,
    });
    if (result.error) return { ok: false, error: result.error === "unknown" ? result.detail : result.error };
    const booking = result.booking;
    await audit(actor, "booking.create", "bk_bookings", booking.id, {
      ref: booking.ref,
      source: data.source,
      status: data.status,
      check_in: data.check_in,
      check_out: data.check_out,
      room_type_id: data.room_type_id,
      room_id: data.room_id ?? null,
      total_omr: booking.total_omr,
    });
    try {
      await dispatchForBooking(booking.id, ["confirmation"]);
    } catch (e) {
      logger.warn("booking.create", "dispatch failed; the cron will retry", { error: (e as Error).message });
    }
    revalidateBooking(booking.id);
    revalidatePath("/messaging");
    return { ok: true, data: { id: booking.id, ref: booking.ref } };
  });
}

// Hard delete is intentionally NOT offered. CSV export lives in
// /reservations/export/route.ts (super_admin only).
