import "server-only";

// ---------------------------------------------------------------------------
// New-booking alert for the reservations desk.
//
//   notifyStaffNewBooking(id)      — called inline right after bk_create_booking
//                                    (website and back-office bookings alike)
//   notifyStaffPendingBookings()   — cron safety net (/api/cron/dispatch): any
//                                    booking of the last 48 h that no recipient
//                                    has received yet is sent again
//   sendStaffNewBookingTest(to)    — admin "send me a test" with sample data
//
// Every attempt is written to bk_message_log (kind `staff_new_booking`, one row
// per recipient) — that log is also the dedup ledger, so the catch-up never
// re-sends to an address that already has a `sent` row. Nothing in here
// throws: a failed alert must never fail the booking.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingById, type BookingWithRelations } from "@/lib/bk/bookings";
import { getSettings } from "@/lib/bk/settings";
import type { AllSettings } from "@/lib/bk/types";
import type { Json } from "@/lib/database.types";
import { logger } from "@/lib/logger";
import { emailConfigured, sendGuestEmail } from "./providers/email";
import { parseRecipients } from "./recipients";
import { buildContext, sampleBooking } from "./templates";
import { buildStaffNewBooking, type StaffEmail } from "./templates/staff-new-booking";

export const STAFF_NEW_BOOKING_KIND = "staff_new_booking";
/** After this many failed rows for one booking the catch-up stops trying. */
export const MAX_STAFF_ALERT_FAILURES = 3;
/** The catch-up leaves the inline send this long to finish before it looks at a booking. */
export const CATCH_UP_MIN_AGE_MS = 10 * 60_000;
export const CATCH_UP_MAX_AGE_MS = 48 * 3600_000;
const CATCH_UP_BATCH = 20;

const SCOPE = "messaging.staff_alert";

type Admin = ReturnType<typeof createAdminClient>;

export type StaffAlertStatus =
  | "sent"
  | "failed"
  | "stubbed"
  | "disabled"
  | "no_recipient"
  | "booking_not_found"
  | "already_sent"
  | "error";

export interface StaffAlertResult {
  status: StaffAlertStatus;
  /** Addresses this call attempted (empty when nothing was attempted). */
  recipients: string[];
  /** Addresses that have a `sent` row after this call. */
  delivered: string[];
  error: string | null;
}

export interface StaffAlertCatchUp {
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface LogRow {
  booking_id: string | null;
  recipient: string | null;
  status: string;
}

async function readLog(admin: Admin, bookingIds: string[]): Promise<LogRow[]> {
  if (bookingIds.length === 0) return [];
  const { data, error } = await admin
    .from("bk_message_log")
    .select("booking_id, recipient, status")
    .eq("kind", STAFF_NEW_BOOKING_KIND)
    .in("booking_id", bookingIds);
  if (error) throw new Error(`staff alert log read failed: ${error.message}`);
  return (data ?? []) as LogRow[];
}

function deliveredTo(rows: LogRow[], bookingId: string): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.booking_id === bookingId && r.status === "sent" && r.recipient) out.add(r.recipient.toLowerCase());
  }
  return out;
}

function failuresFor(rows: LogRow[], bookingId: string): number {
  return rows.filter((r) => r.booking_id === bookingId && r.status === "failed").length;
}

async function writeLog(
  admin: Admin,
  bookingId: string | null,
  recipient: string,
  status: "sent" | "failed" | "stubbed" | "test",
  payload: Record<string, Json | undefined>,
  messageId: string | null,
  error: string | null
): Promise<void> {
  const { error: dbError } = await admin.from("bk_message_log").insert({
    booking_id: bookingId,
    scheduled_id: null,
    channel: "email",
    kind: STAFF_NEW_BOOKING_KIND,
    recipient,
    provider_message_id: messageId,
    payload: payload as Json,
    status,
    error,
  });
  if (dbError) logger.error(SCOPE, "bk_message_log insert failed", { error: dbError.message, booking_id: bookingId, recipient });
}

/** Send one built email to each address, logging one row per address. */
async function deliver(
  admin: Admin,
  bookingId: string | null,
  recipients: string[],
  built: StaffEmail,
  extraPayload: Record<string, Json | undefined>,
  test: boolean
): Promise<{ sent: string[]; failed: string[]; stubbed: boolean; error: string | null }> {
  const sent: string[] = [];
  const failed: string[] = [];
  let stubbed = false;
  let lastError: string | null = null;
  for (const to of recipients) {
    const r = await sendGuestEmail(to, built.subject, built.html, built.text);
    const payload = { subject: built.subject, fallback_sender: r.fallback_sender, ...extraPayload, ...(test ? { test: true } : {}) };
    if (r.stubbed) {
      stubbed = true;
      lastError = r.reason ?? r.error;
      await writeLog(admin, bookingId, to, test ? "test" : "stubbed", payload, null, lastError);
      continue;
    }
    if (r.ok) {
      sent.push(to);
      await writeLog(admin, bookingId, to, test ? "test" : "sent", payload, r.messageId, r.reason);
    } else {
      failed.push(to);
      lastError = r.reason ?? r.error ?? "unknown";
      await writeLog(admin, bookingId, to, test ? "test" : "failed", payload, null, lastError);
    }
  }
  return { sent, failed, stubbed, error: lastError };
}

function alertRecipients(settings: AllSettings): string[] {
  return parseRecipients(settings.messaging.notify_email);
}

/**
 * Email the reservations desk about one booking. Addresses that already have
 * a `sent` row are skipped (pass `force` to re-send to everyone, e.g. from a
 * button in the back-office).
 */
export async function notifyStaffNewBooking(bookingId: string, opts: { force?: boolean } = {}): Promise<StaffAlertResult> {
  const none = (status: StaffAlertStatus, error: string | null = null): StaffAlertResult => ({ status, recipients: [], delivered: [], error });
  try {
    const settings = await getSettings();
    if (!settings.messaging.notify_new_booking) return none("disabled");
    const all = alertRecipients(settings);
    if (all.length === 0) {
      logger.warn(SCOPE, "no valid recipient configured", { booking_id: bookingId });
      return none("no_recipient");
    }

    const admin = createAdminClient();
    const booking = await getBookingById(bookingId);
    if (!booking) return none("booking_not_found");

    const already = opts.force ? new Set<string>() : deliveredTo(await readLog(admin, [bookingId]), bookingId);
    const recipients = all.filter((a) => !already.has(a.toLowerCase()));
    if (recipients.length === 0) return { status: "already_sent", recipients: [], delivered: all, error: null };

    const result = await deliver(admin, booking.id, recipients, buildStaffNewBooking(buildContext(booking, settings, "en")), { ref: booking.ref, source: booking.source }, false);
    const delivered = Array.from(already).concat(result.sent.map((a) => a.toLowerCase()));
    const status: StaffAlertStatus = result.stubbed && result.sent.length === 0 && result.failed.length === 0 ? "stubbed" : result.failed.length > 0 ? "failed" : "sent";
    logger.info(SCOPE, status, { booking_id: bookingId, ref: booking.ref, recipients, failed: result.failed });
    return { status, recipients, delivered, error: result.error };
  } catch (e) {
    const message = errorMessage(e);
    logger.error(SCOPE, "notifyStaffNewBooking failed", { booking_id: bookingId, error: message });
    return none("error", message);
  }
}

/**
 * Cron safety net: bookings created between 48 h and 10 min ago whose alert
 * never reached every recipient (inline send crashed, Resend was down, the
 * address was changed) are sent again — at most MAX_STAFF_ALERT_FAILURES
 * failed attempts per booking, then it is left to the log.
 */
export async function notifyStaffPendingBookings(now: Date = new Date()): Promise<StaffAlertCatchUp> {
  const summary: StaffAlertCatchUp = { checked: 0, sent: 0, failed: 0, skipped: 0, errors: [] };
  try {
    if (!emailConfigured()) return summary; // nothing would go out; don't fill the log with stubs
    const settings = await getSettings();
    if (!settings.messaging.notify_new_booking) return summary;
    const recipients = alertRecipients(settings);
    if (recipients.length === 0) return summary;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("bk_bookings")
      .select("id, ref")
      .gte("created_at", new Date(now.getTime() - CATCH_UP_MAX_AGE_MS).toISOString())
      .lte("created_at", new Date(now.getTime() - CATCH_UP_MIN_AGE_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(`bookings read failed: ${error.message}`);
    const bookings = (data ?? []) as { id: string; ref: string }[];
    summary.checked = bookings.length;
    if (bookings.length === 0) return summary;

    const log = await readLog(admin, bookings.map((b) => b.id));
    const due = bookings.filter((b) => {
      const got = deliveredTo(log, b.id);
      if (recipients.every((r) => got.has(r.toLowerCase()))) return false;
      if (failuresFor(log, b.id) >= MAX_STAFF_ALERT_FAILURES) {
        summary.skipped++;
        return false;
      }
      return true;
    });

    for (const b of due.slice(0, CATCH_UP_BATCH)) {
      const r = await notifyStaffNewBooking(b.id);
      if (r.status === "sent") summary.sent++;
      else if (r.status === "already_sent") summary.skipped++;
      else {
        summary.failed++;
        summary.errors.push(`${b.ref}: ${r.error ?? r.status}`);
      }
    }
    if (due.length > CATCH_UP_BATCH) summary.skipped += due.length - CATCH_UP_BATCH;
    if (due.length > 0) logger.info(SCOPE, "catch-up done", { ...summary, errors: summary.errors.length });
  } catch (e) {
    const message = errorMessage(e);
    summary.errors.push(`catch-up: ${message}`);
    logger.error(SCOPE, "notifyStaffPendingBookings failed", { error: message });
  }
  return summary;
}

/** Admin test: the sample booking, to the given addresses, logged with status `test`. */
export async function sendStaffNewBookingTest(to: string[]): Promise<{ ok: boolean; stubbed: boolean; error: string | null }> {
  try {
    const settings = await getSettings();
    const admin = createAdminClient();
    const booking: BookingWithRelations = sampleBooking("en");
    const built = buildStaffNewBooking(buildContext(booking, settings, "en"));
    const r = await deliver(admin, null, to, built, { ref: booking.ref, source: booking.source }, true);
    if (r.stubbed && r.sent.length === 0) return { ok: false, stubbed: true, error: r.error };
    return { ok: r.failed.length === 0, stubbed: false, error: r.failed.length > 0 ? r.error : null };
  } catch (e) {
    const message = errorMessage(e);
    logger.error(SCOPE, "sendStaffNewBookingTest failed", { error: message });
    return { ok: false, stubbed: false, error: message };
  }
}
