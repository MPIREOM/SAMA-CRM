import "server-only";

// ---------------------------------------------------------------------------
// New-booking alert for the reservations desk.
//
//   notifyStaffNewBooking(id)      — called inline right after bk_create_booking
//                                    (website and back-office bookings alike)
//   notifyStaffPendingBookings()   — cron safety net (/api/cron/dispatch): any
//                                    booking of the last 48 h that an address
//                                    has not received yet is sent again
//   sendStaffNewBookingTest(to)    — admin "send me a test" with sample data
//
// Every attempt is written to bk_message_log (kind `staff_new_booking`, one row
// per recipient, payload.recipients = the whole list that attempt was meant
// for) — that log is also the ledger: an address with a `sent` row is never
// written to again for that booking, one with MAX_STAFF_ALERT_FAILURES failed
// rows is left alone, and the catch-up only retries what an earlier attempt
// meant to send (it never back-fills an address added to the list later).
// Two cron callers (Vercel every 15 min, pg_cron every 10 min) coincide twice
// an hour, so the catch-up first claims a short lock on a bk_settings row.
// Nothing in here throws: a failed alert must never fail the booking.
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
/** Per booking × address: after this many failed rows the catch-up stops trying that address. */
export const MAX_STAFF_ALERT_FAILURES = 3;
/** The catch-up leaves the inline send this long to finish before it looks at a booking. */
export const CATCH_UP_MIN_AGE_MS = 10 * 60_000;
export const CATCH_UP_MAX_AGE_MS = 48 * 3600_000;
/** bk_settings row used as the catch-up mutex; a claim is good for CATCH_UP_LOCK_TTL_MS. */
export const CATCH_UP_LOCK_KEY = "staff_alert_cron";
export const CATCH_UP_LOCK_TTL_MS = 4 * 60_000;
const CATCH_UP_SCAN = 200;
const CATCH_UP_BATCH = 20;
const LOG_CHUNK = 40;

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
  /** True when another cron run held the lock and this one did nothing. */
  locked: boolean;
  errors: string[];
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Log = ledger
// ---------------------------------------------------------------------------

interface LogRow {
  booking_id: string | null;
  recipient: string | null;
  status: string;
  payload: Json | null;
}

/** What the log says about one booking, per address (lower-cased). */
interface Ledger {
  /** Addresses with a `sent` row. */
  delivered: Set<string>;
  /** Addresses an attempt was meant for (payload.recipients) or that have a row of their own. */
  planned: Set<string>;
  /** Failed rows per address. */
  failures: Map<string, number>;
  /** False when the booking has no rows at all (the inline send never got that far). */
  attempted: boolean;
}

function plannedIn(payload: Json | null): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const list = (payload as Record<string, Json | undefined>).recipients;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

async function readLog(admin: Admin, bookingIds: string[]): Promise<Map<string, Ledger>> {
  const out = new Map<string, Ledger>();
  for (let i = 0; i < bookingIds.length; i += LOG_CHUNK) {
    const chunk = bookingIds.slice(i, i + LOG_CHUNK);
    const { data, error } = await admin
      .from("bk_message_log")
      .select("booking_id, recipient, status, payload")
      .eq("kind", STAFF_NEW_BOOKING_KIND)
      .in("booking_id", chunk)
      .limit(1000);
    if (error) throw new Error(`staff alert log read failed: ${error.message}`);
    for (const r of (data ?? []) as LogRow[]) {
      if (!r.booking_id || !r.recipient) continue;
      const ledger = out.get(r.booking_id) ?? emptyLedger(true);
      const key = r.recipient.toLowerCase();
      ledger.planned.add(key);
      for (const p of plannedIn(r.payload)) ledger.planned.add(p.toLowerCase());
      if (r.status === "sent") ledger.delivered.add(key);
      else if (r.status === "failed") ledger.failures.set(key, (ledger.failures.get(key) ?? 0) + 1);
      out.set(r.booking_id, ledger);
    }
  }
  return out;
}

function emptyLedger(attempted: boolean): Ledger {
  return { delivered: new Set(), planned: new Set(), failures: new Map(), attempted };
}

/**
 * Addresses still owed an email. A booking nobody has tried yet is owed to the
 * whole list; otherwise only addresses an earlier attempt meant to reach, that
 * neither got it nor failed MAX_STAFF_ALERT_FAILURES times.
 */
function owed(recipients: string[], ledger: Ledger): string[] {
  if (!ledger.attempted) return recipients;
  return recipients.filter((r) => {
    const key = r.toLowerCase();
    return ledger.planned.has(key) && !ledger.delivered.has(key) && (ledger.failures.get(key) ?? 0) < MAX_STAFF_ALERT_FAILURES;
  });
}

/** True when some address on the list was given up on for this booking. */
function gaveUp(recipients: string[], ledger: Ledger): boolean {
  return recipients.some((r) => (ledger.failures.get(r.toLowerCase()) ?? 0) >= MAX_STAFF_ALERT_FAILURES && !ledger.delivered.has(r.toLowerCase()));
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
    const payload = { subject: built.subject, recipients, fallback_sender: r.fallback_sender, ...extraPayload, ...(test ? { test: true } : {}) };
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

// ---------------------------------------------------------------------------
// One booking
// ---------------------------------------------------------------------------

/**
 * Email the reservations desk about one booking. Addresses that already have
 * a `sent` row, or that failed MAX_STAFF_ALERT_FAILURES times, are skipped
 * (pass `force` to send to everyone again, e.g. from a back-office button).
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

    const ledger = opts.force ? emptyLedger(false) : ((await readLog(admin, [bookingId])).get(bookingId) ?? emptyLedger(false));
    const recipients = owed(all, ledger);
    const already = all.filter((a) => ledger.delivered.has(a.toLowerCase()));
    if (recipients.length === 0) return { status: "already_sent", recipients: [], delivered: already, error: null };

    const result = await deliver(admin, booking.id, recipients, buildStaffNewBooking(buildContext(booking, settings, "en")), { ref: booking.ref, source: booking.source }, false);
    const delivered = already.concat(result.sent);
    const status: StaffAlertStatus = result.stubbed && result.sent.length === 0 && result.failed.length === 0 ? "stubbed" : result.failed.length > 0 ? "failed" : "sent";
    logger.info(SCOPE, status, { booking_id: bookingId, ref: booking.ref, recipients, failed: result.failed });
    return { status, recipients, delivered, error: result.error };
  } catch (e) {
    const message = errorMessage(e);
    logger.error(SCOPE, "notifyStaffNewBooking failed", { booking_id: bookingId, error: message });
    return none("error", message);
  }
}

// ---------------------------------------------------------------------------
// Cron catch-up
// ---------------------------------------------------------------------------

/**
 * Compare-and-set on one bk_settings row: the update only matches when the
 * previous claim is older than the TTL, and PostgREST returns the rows it
 * changed — so of two overlapping runs exactly one gets the row back. The
 * row is created on first use (an expired claim), and a losing concurrent
 * insert simply fails on the primary key.
 */
async function claimCatchUpLock(admin: Admin, now: Date): Promise<boolean> {
  const nowIso = now.toISOString();
  const expiredBefore = new Date(now.getTime() - CATCH_UP_LOCK_TTL_MS).toISOString();
  const claim = async (): Promise<boolean> => {
    const { data, error } = await admin
      .from("bk_settings")
      .update({ value: { locked_at: nowIso }, updated_at: nowIso })
      .eq("key", CATCH_UP_LOCK_KEY)
      .lt("updated_at", expiredBefore)
      .select("key");
    if (error) throw new Error(`lock update failed: ${error.message}`);
    return (data ?? []).length > 0;
  };
  if (await claim()) return true;
  const { data: existing, error: readError } = await admin.from("bk_settings").select("key").eq("key", CATCH_UP_LOCK_KEY).maybeSingle();
  if (readError) throw new Error(`lock read failed: ${readError.message}`);
  if (existing) return false; // someone else holds a fresh claim
  const { error: insertError } = await admin
    .from("bk_settings")
    .insert({ key: CATCH_UP_LOCK_KEY, value: { locked_at: null }, updated_at: new Date(0).toISOString(), updated_by: null });
  if (insertError && !/duplicate|23505|exists|conflict/i.test(insertError.message)) throw new Error(`lock insert failed: ${insertError.message}`);
  return claim();
}

/**
 * Cron safety net: bookings created between 48 h and 10 min ago that some
 * configured address has not received (inline send crashed, Resend was down,
 * the list changed) are sent again — to those addresses only, and never more
 * than MAX_STAFF_ALERT_FAILURES failed attempts per address.
 */
export async function notifyStaffPendingBookings(now: Date = new Date()): Promise<StaffAlertCatchUp> {
  const summary: StaffAlertCatchUp = { checked: 0, sent: 0, failed: 0, skipped: 0, locked: false, errors: [] };
  try {
    if (!emailConfigured()) return summary; // nothing would go out; don't fill the log with stubs
    const settings = await getSettings();
    if (!settings.messaging.notify_new_booking) return summary;
    const recipients = alertRecipients(settings);
    if (recipients.length === 0) return summary;

    const admin = createAdminClient();
    if (!(await claimCatchUpLock(admin, now))) {
      summary.locked = true;
      return summary;
    }

    const { data, error } = await admin
      .from("bk_bookings")
      .select("id, ref")
      .gte("created_at", new Date(now.getTime() - CATCH_UP_MAX_AGE_MS).toISOString())
      .lte("created_at", new Date(now.getTime() - CATCH_UP_MIN_AGE_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(CATCH_UP_SCAN);
    if (error) throw new Error(`bookings read failed: ${error.message}`);
    const bookings = (data ?? []) as { id: string; ref: string }[];
    summary.checked = bookings.length;
    if (bookings.length === 0) return summary;

    const log = await readLog(admin, bookings.map((b) => b.id));
    const due = bookings.filter((b) => {
      const ledger = log.get(b.id) ?? emptyLedger(false);
      if (owed(recipients, ledger).length > 0) return true;
      if (gaveUp(recipients, ledger)) summary.skipped++;
      return false;
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

// ---------------------------------------------------------------------------
// Admin test
// ---------------------------------------------------------------------------

/** Admin test: the sample booking, marked as a test, to the given addresses; logged with status `test`. */
export async function sendStaffNewBookingTest(to: string[]): Promise<{ ok: boolean; stubbed: boolean; error: string | null }> {
  try {
    const settings = await getSettings();
    const admin = createAdminClient();
    const booking: BookingWithRelations = sampleBooking("en");
    const built = buildStaffNewBooking(buildContext(booking, settings, "en"), undefined, { test: true });
    const r = await deliver(admin, null, to, built, { ref: booking.ref, source: booking.source }, true);
    if (r.stubbed && r.sent.length === 0) return { ok: false, stubbed: true, error: r.error };
    return { ok: r.failed.length === 0, stubbed: false, error: r.failed.length > 0 ? r.error : null };
  } catch (e) {
    const message = errorMessage(e);
    logger.error(SCOPE, "sendStaffNewBookingTest failed", { error: message });
    return { ok: false, stubbed: false, error: message };
  }
}
