"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { cancelBooking, createBooking } from "@/lib/bk/bookings";
import { getQuote } from "@/lib/bk/catalogue";
import { getSettings } from "@/lib/bk/settings";
import type { QuoteResult } from "@/lib/bk/types";
import { dispatchForBooking } from "@/lib/messaging/dispatch";
import { normalizePhone } from "@/lib/phone";
import { logger } from "@/lib/logger";
import { muscatToday } from "@/lib/booking-engine/dates";
import { nightsBetween, type NightlyRate } from "@/lib/booking-engine/pricing";
import type { BkBookingAddonStatus, Json } from "@/lib/database.types";
import { runAction } from "@/components/admin/server";
import { ADDON_TRANSITIONS, addonLineOmr, bookingMoneyWithAddons, type ActionResult } from "@/components/admin/shared";

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
  /** Omit to leave the bed layout untouched; null clears it. */
  bed_preference: z.enum(["twin", "king"]).nullable().optional(),
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
      ...(data.bed_preference !== undefined ? { bed_preference: data.bed_preference } : {}),
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
    // Room-only re-quote; the booked add-on lines keep their stored unit prices
    // and are folded back into the money columns below (per_night lines are
    // re-priced for the new number of nights).
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
    const nightly = (q.nightly ?? []).map((n) => ({ date: n.date, rate: Number(n.rate) }));
    const lines = await loadAddonLines(data.bookingId);
    const nights = nightsBetween(data.check_in, data.check_out);
    for (const line of lines) {
      if (line.status === "cancelled" || line.addon?.unit !== "per_night") continue;
      const total = addonLineOmr(line.unit_price_omr, line.quantity, "per_night", nights);
      if (total !== line.total_omr) {
        const { error: lineErr } = await admin.from("bk_booking_addons").update({ total_omr: total }).eq("id", line.id);
        if (lineErr) return { ok: false, error: lineErr.message };
        line.total_omr = total;
      }
    }
    const money = bookingMoneyWithAddons(nightly, Number(q.discount), lines, (await getSettings()).taxes);
    const { error } = await admin
      .from("bk_bookings")
      .update({
        check_in: data.check_in,
        check_out: data.check_out,
        adults: data.adults,
        children: data.children,
        nightly_rates: nightly as unknown as Json,
        ...money,
        promo_code: q.promo_valid ? q.promo_code : null,
      })
      .eq("id", data.bookingId);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "booking.change_dates", "bk_bookings", data.bookingId, {
      check_in: { from: before.check_in, to: data.check_in },
      check_out: { from: before.check_out, to: data.check_out },
      adults: { from: before.adults, to: data.adults },
      children: { from: before.children, to: data.children },
      total_omr: { from: before.total_omr, to: money.total_omr },
    });
    revalidateBooking(data.bookingId);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Add-ons on a booking (APEX Zipline, 4WD transfers)
// ---------------------------------------------------------------------------

interface AddonLineRow {
  id: string;
  addon_id: string;
  quantity: number;
  unit_price_omr: number;
  total_omr: number;
  taxable: boolean;
  note: string | null;
  status: string;
  addon: { slug: string; name_en: string; unit: string } | null;
}

async function loadAddonLines(bookingId: string): Promise<AddonLineRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bk_booking_addons")
    .select("id, addon_id, quantity, unit_price_omr, total_omr, taxable, note, status, addon:bk_addons(slug, name_en, unit)")
    .eq("booking_id", bookingId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({
    ...l,
    unit_price_omr: Number(l.unit_price_omr),
    total_omr: Number(l.total_omr),
    addon: Array.isArray(l.addon) ? (l.addon[0] ?? null) : l.addon,
  }));
}

/**
 * Rewrite addons_omr / taxes / total_omr from the stored nightly rates,
 * discount and the booking's live add-on lines. Returns the money diff.
 */
async function recomputeBookingMoney(bookingId: string): Promise<{ from: number; to: number; addons_omr: number }> {
  const admin = createAdminClient();
  const booking = await loadBooking(bookingId);
  const nightly = (Array.isArray(booking.nightly_rates) ? booking.nightly_rates : []) as unknown as NightlyRate[];
  const lines = await loadAddonLines(bookingId);
  const money = bookingMoneyWithAddons(
    nightly.map((n) => ({ date: n.date, rate: Number(n.rate) })),
    Number(booking.discount_omr),
    lines,
    (await getSettings()).taxes
  );
  const { error } = await admin.from("bk_bookings").update(money).eq("id", bookingId);
  if (error) throw new Error(error.message);
  return { from: Number(booking.total_omr), to: money.total_omr, addons_omr: money.addons_omr };
}

const AddonStatusSchema = z.object({
  bookingId: uuid,
  lineId: uuid,
  status: z.enum(["confirmed", "done", "cancelled"]),
});

/** Confirm / mark done / cancel one booked add-on line. Cancelling takes it out of the total. */
export async function setBookingAddonStatus(input: unknown): Promise<ActionResult> {
  return runAction("booking.addon_status", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { bookingId, lineId, status } = AddonStatusSchema.parse(input);
    const lines = await loadAddonLines(bookingId);
    const line = lines.find((l) => l.id === lineId);
    if (!line) return { ok: false, error: "addon_not_found" };
    const allowed = ADDON_TRANSITIONS[line.status as BkBookingAddonStatus] ?? [];
    if (!allowed.includes(status)) return { ok: false, error: "addon_transition" };
    const admin = createAdminClient();
    const { error } = await admin.from("bk_booking_addons").update({ status }).eq("id", lineId);
    if (error) return { ok: false, error: error.message };
    const diff: Record<string, unknown> = { addon: line.addon?.slug ?? line.addon_id, status: { from: line.status, to: status } };
    if (status === "cancelled") {
      const money = await recomputeBookingMoney(bookingId);
      diff.total_omr = { from: money.from, to: money.to };
    }
    await audit(actor, "booking.addon_status", "bk_bookings", bookingId, diff);
    revalidateBooking(bookingId);
    return { ok: true };
  });
}

const AddAddonSchema = z.object({
  bookingId: uuid,
  addonId: uuid,
  quantity: z.number().int().min(1).max(50),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * Staff add an add-on to an existing booking. Priced from the catalogue
 * (per_night × nights); a previously cancelled line for the same add-on is
 * revived instead of duplicated (booking × addon is unique).
 */
export async function addBookingAddon(input: unknown): Promise<ActionResult> {
  return runAction("booking.addon_add", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const data = AddAddonSchema.parse(input);
    const booking = await loadBooking(data.bookingId);
    if (booking.status === "cancelled" || booking.status === "no_show" || booking.status === "checked_out") {
      return { ok: false, error: "This booking can no longer be changed." };
    }
    const admin = createAdminClient();
    const { data: addon, error: addonErr } = await admin.from("bk_addons").select("*").eq("id", data.addonId).eq("is_active", true).maybeSingle();
    if (addonErr) return { ok: false, error: addonErr.message };
    if (!addon) return { ok: false, error: "addon_not_found" };
    if (data.quantity > addon.max_quantity) return { ok: false, error: "addon_quantity" };
    const nights = nightsBetween(booking.check_in, booking.check_out);
    const unitPrice = Number(addon.price_omr);
    const line = {
      quantity: data.quantity,
      unit_price_omr: unitPrice,
      total_omr: addonLineOmr(unitPrice, data.quantity, addon.unit, nights),
      taxable: addon.taxable,
      note: data.note || null,
      status: "requested" as const,
    };
    const existing = (await loadAddonLines(data.bookingId)).find((l) => l.addon_id === addon.id);
    if (existing && existing.status !== "cancelled") return { ok: false, error: "addon_exists" };
    if (existing) {
      const { error } = await admin.from("bk_booking_addons").update(line).eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await admin.from("bk_booking_addons").insert({ booking_id: data.bookingId, addon_id: addon.id, ...line });
      if (error) return { ok: false, error: error.code === "23505" ? "addon_exists" : error.message };
    }
    const money = await recomputeBookingMoney(data.bookingId);
    await audit(actor, "booking.addon_add", "bk_bookings", data.bookingId, {
      addon: addon.slug,
      quantity: data.quantity,
      total_omr_line: line.total_omr,
      note: line.note,
      revived: Boolean(existing),
      total_omr: { from: money.from, to: money.to },
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

/** Add-on selection from the staff form: `{ addon_id, quantity, note }`; zero quantities are dropped. */
const AddonSelectionSchema = z
  .array(
    z.object({
      addon_id: uuid,
      quantity: z.number().int().min(0).max(50),
      note: z.string().trim().max(500).optional().nullable(),
    })
  )
  .max(20)
  .optional()
  .nullable();

const QuoteSchema = z.object({
  roomTypeId: uuid,
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  promoCode: z.string().trim().max(40).optional().nullable(),
  addons: AddonSelectionSchema,
});

export async function quotePreview(input: unknown): Promise<ActionResult<QuoteResult>> {
  return runAction("booking.quote", async () => {
    await requireStaff(FRONT_DESK_ROLES);
    const data = QuoteSchema.parse(input);
    if (data.checkOut <= data.checkIn) return { ok: false, error: "invalid_dates" };
    const result = await getQuote({
      ...data,
      addons: (data.addons ?? []).filter((a) => a.quantity > 0).map((a) => ({ addon_id: a.addon_id, quantity: a.quantity, note: a.note || null })),
    });
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

export type FreeRoom = { id: string; room_number: string; floor: string | null; bed_type: string | null };

export async function freeRooms(input: unknown): Promise<ActionResult<FreeRoom[]>> {
  return runAction("booking.free_rooms", async () => {
    await requireStaff(FRONT_DESK_ROLES);
    const data = FreeRoomsSchema.parse(input);
    if (data.checkOut <= data.checkIn) return { ok: true, data: [] };
    const admin = createAdminClient();
    const [rooms, taken, blocked] = await Promise.all([
      admin
        .from("bk_rooms")
        .select("id, room_number, floor, bed_type")
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
  /** Bed layout for types that offer a choice; the RPC takes the type's first option when omitted. */
  bed_preference: z.enum(["twin", "king"]).optional().nullable(),
  addons: AddonSelectionSchema,
});

export async function createStaffBooking(input: unknown): Promise<ActionResult<{ id: string; ref: string }>> {
  return runAction("booking.create", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const data = CreateSchema.parse(input);
    if (data.check_out <= data.check_in) return { ok: false, error: "invalid_dates" };
    const phone = normalizePhone(data.guest_phone);
    if (!phone) return { ok: false, error: "invalid_phone" };
    const addons = (data.addons ?? []).filter((a) => a.quantity > 0).map((a) => ({ addon_id: a.addon_id, quantity: a.quantity, note: a.note || null }));
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
      bed_preference: data.bed_preference || null,
      promo_code: data.promo_code || null,
      source: data.source,
      status: data.status,
      room_id: data.room_id || null,
      created_by: actor.userId,
      addons: addons.length > 0 ? addons : null,
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
      addons: addons.map((a) => ({ addon_id: a.addon_id, quantity: a.quantity })),
      addons_omr: booking.addons_omr,
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
