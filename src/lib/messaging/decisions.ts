// Pure decision logic for the dispatcher (unit-tested, no I/O).
import type { AllSettings } from "@/lib/bk/types";
import { nextRetryAt } from "@/lib/booking-engine/dates";
import type { BkBooking, BkScheduledMessage } from "@/lib/database.types";

/** Minimal shapes so tests (and callers) don't need full rows. */
export type SkipBooking = Pick<BkBooking, "status" | "guest_email" | "guest_phone">;
export type SkipRow = Pick<BkScheduledMessage, "channel" | "kind">;
export type SkipSettings = Pick<AllSettings["messaging"], "email_enabled" | "whatsapp_enabled">;

export type SkipDecision = { skip: true; reason: string } | { skip: false };

export const INACTIVE_BOOKING_STATUSES = new Set(["cancelled", "no_show"]);

/**
 * Why a scheduled message should NOT go out. Order matters: a cancelled
 * booking beats a disabled channel beats a missing address, so the reason
 * staff read is the most fundamental one.
 */
export function shouldSkip(
  booking: SkipBooking | null | undefined,
  settings: { messaging: SkipSettings },
  row: SkipRow
): SkipDecision {
  if (!booking) return { skip: true, reason: "booking_not_found" };
  if (INACTIVE_BOOKING_STATUSES.has(booking.status)) return { skip: true, reason: `booking_${booking.status}` };
  if (row.channel === "email") {
    if (!settings.messaging.email_enabled) return { skip: true, reason: "email_disabled" };
    if (!booking.guest_email || !booking.guest_email.trim()) return { skip: true, reason: "no_email" };
    return { skip: false };
  }
  if (row.channel === "whatsapp") {
    if (!settings.messaging.whatsapp_enabled) return { skip: true, reason: "whatsapp_disabled" };
    if (!booking.guest_phone || !booking.guest_phone.trim()) return { skip: true, reason: "no_phone" };
    return { skip: false };
  }
  return { skip: true, reason: `unknown_channel_${row.channel}` };
}

export type RetryDecision = { status: "pending"; send_at: Date } | { status: "failed"; send_at: null };

/**
 * After a failed attempt: retry with backoff or give up.
 * `attempts` = attempts made so far INCLUDING the one that just failed.
 * Backoff (nextRetryAt): 1st failure → +5 min, 2nd → +30 min, 3rd → +3 h,
 * 4th → failed. Non-retryable errors fail immediately.
 */
export function decideRetry(attempts: number, retryable: boolean, now: Date = new Date()): RetryDecision {
  if (!retryable) return { status: "failed", send_at: null };
  const at = nextRetryAt(Math.max(0, attempts - 1), now);
  return at ? { status: "pending", send_at: at } : { status: "failed", send_at: null };
}

/** `sending` rows older than this are considered orphaned (crashed worker) and unlocked. */
export const STALE_LOCK_MINUTES = 10;

export function staleLockCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - STALE_LOCK_MINUTES * 60_000);
}
