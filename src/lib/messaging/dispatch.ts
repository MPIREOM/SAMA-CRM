import "server-only";

// ---------------------------------------------------------------------------
// Guest messaging dispatcher.
//
// Rows in bk_scheduled_messages are created by the database
// (bk_schedule_booking_messages) — one per booking × channel × kind. This
// module turns due rows into real sends:
//
//   dispatchDueMessages(limit)  — cron safety net (/api/cron/dispatch, every 10–15 min)
//   dispatchForBooking(id, …)   — called inline right after bk_create_booking
//   sendTest(kind, channel, to) — admin "send me a test" with sample data
//
// Guarantees: rows are locked atomically (pending → sending) before any
// provider call, so two overlapping runs never double-send; every attempt is
// logged to bk_message_log (+ a CRM `messages` row for real sends); nothing
// throws out of the dispatcher — every row is handled in its own try/catch.
// ---------------------------------------------------------------------------

import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingById, type BookingWithRelations } from "@/lib/bk/bookings";
import { getSettings } from "@/lib/bk/settings";
import type { AllSettings } from "@/lib/bk/types";
import type { BkScheduledMessage, Json } from "@/lib/database.types";
import { logger } from "@/lib/logger";
import { decideRetry, shouldSkip, staleLockCutoff } from "./decisions";
import { sendGuestEmail } from "./providers/email";
import { sendWhatsApp } from "./providers/whatsapp";
import { buildContext, buildMessage, sampleContext } from "./templates";
import { isChannel, isMessageKind, toLocale } from "./types";
import type { BuiltMessage, Channel, DispatchSummary, Locale, MessageKind } from "./types";

export type { MessageKind, DispatchSummary } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

const SCOPE = "messaging.dispatch";
const CONCURRENCY = 5;
/** dispatchForBooking picks rows due within this window (the confirmation is due "now"). */
const INLINE_WINDOW_MS = 60_000;

function emptySummary(): DispatchSummary {
  return { picked: 0, sent: 0, failed: 0, stubbed: 0, skipped: 0, errors: [] };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Row locking
// ---------------------------------------------------------------------------

/**
 * Flip the given rows pending → sending in one statement and return only the
 * rows this call actually locked. A concurrent dispatcher racing for the same
 * ids gets the complement — never the same row.
 */
async function lockRows(admin: Admin, ids: string[]): Promise<BkScheduledMessage[]> {
  if (ids.length === 0) return [];
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("bk_scheduled_messages")
    .update({ status: "sending", locked_at: now, updated_at: now })
    .in("id", ids)
    .eq("status", "pending")
    .select("*");
  if (error) throw new Error(`lock failed: ${error.message}`);
  return data ?? [];
}

/** Rows stuck in `sending` (worker died mid-run) go back to pending after 10 minutes. */
async function recoverStaleLocks(admin: Admin): Promise<number> {
  const cutoff = staleLockCutoff().toISOString();
  const patch = { status: "pending", locked_at: null, updated_at: new Date().toISOString() };
  const [expired, unlocked] = await Promise.all([
    admin.from("bk_scheduled_messages").update(patch).eq("status", "sending").lt("locked_at", cutoff).select("id"),
    admin.from("bk_scheduled_messages").update(patch).eq("status", "sending").is("locked_at", null).select("id"),
  ]);
  for (const r of [expired, unlocked]) {
    if (r.error) logger.warn(SCOPE, "stale lock recovery failed", { error: r.error.message });
  }
  const n = (expired.data?.length ?? 0) + (unlocked.data?.length ?? 0);
  if (n > 0) logger.warn(SCOPE, "recovered stale sending rows", { count: n });
  return n;
}

// ---------------------------------------------------------------------------
// Sending + logging
// ---------------------------------------------------------------------------

interface SendOutcome {
  ok: boolean;
  stubbed: boolean;
  retryable: boolean;
  messageId: string | null;
  error: string | null;
  reason: string | null;
  recipient: string;
  payload: Json;
  /** Plain text of what the guest received — the CRM inbox body. */
  body: string;
}

async function sendBuilt(channel: Channel, recipient: string, built: BuiltMessage): Promise<SendOutcome> {
  if (channel === "whatsapp") {
    const w = built.whatsapp;
    const r = await sendWhatsApp(recipient, w.templateName, w.langCode, w.params);
    return {
      ok: r.ok,
      stubbed: r.stubbed,
      retryable: r.retryable,
      messageId: r.messageId,
      error: r.error,
      reason: r.reason,
      recipient,
      payload: { template: w.templateName, lang: w.langCode, params: w.params, meta_code: r.code },
      body: w.body,
    };
  }
  const e = built.email;
  const r = await sendGuestEmail(recipient, e.subject, e.html, e.text);
  return {
    ok: r.ok,
    stubbed: r.stubbed,
    retryable: r.retryable,
    messageId: r.messageId,
    error: r.error,
    reason: r.reason,
    recipient,
    payload: { subject: e.subject, fallback_sender: r.fallback_sender },
    body: e.text,
  };
}

async function writeLog(
  admin: Admin,
  row: { booking_id: string | null; scheduled_id: string | null; channel: Channel; kind: MessageKind },
  outcome: SendOutcome,
  status: "sent" | "failed" | "stubbed" | "test"
): Promise<void> {
  const { error } = await admin.from("bk_message_log").insert({
    booking_id: row.booking_id,
    scheduled_id: row.scheduled_id,
    channel: row.channel,
    kind: row.kind,
    recipient: outcome.recipient,
    provider_message_id: outcome.messageId,
    payload: outcome.payload,
    status,
    error: outcome.ok ? (outcome.reason ?? null) : (outcome.reason ?? outcome.error),
  });
  if (error) logger.error(SCOPE, "bk_message_log insert failed", { error: error.message, scheduled_id: row.scheduled_id });
}

/** Mirror real sends (sent or failed — never stubbed/test) into the CRM inbox. */
async function writeCrmMessage(
  admin: Admin,
  booking: BookingWithRelations,
  channel: Channel,
  outcome: SendOutcome
): Promise<void> {
  const { error } = await admin.from("messages").insert({
    contact_id: booking.contact_id,
    booking_id: booking.id,
    direction: "outbound",
    channel,
    status: outcome.ok ? "sent" : "failed",
    body: outcome.ok ? outcome.body : `${outcome.body}\n\n[error: ${outcome.reason ?? outcome.error ?? "unknown"}]`,
    provider_msg_id: outcome.messageId,
    sent_at: new Date().toISOString(),
  });
  if (error) logger.warn(SCOPE, "CRM messages insert failed", { error: error.message, booking_id: booking.id });
}

async function updateRow(admin: Admin, id: string, patch: Partial<BkScheduledMessage>): Promise<void> {
  const { error } = await admin
    .from("bk_scheduled_messages")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) logger.error(SCOPE, "scheduled row update failed", { id, error: error.message, patch });
}

// ---------------------------------------------------------------------------
// One locked row → outcome
// ---------------------------------------------------------------------------

async function processRow(admin: Admin, row: BkScheduledMessage, settings: AllSettings, summary: DispatchSummary): Promise<void> {
  const tag = `${row.kind}/${row.channel} ${row.booking_id}`;
  try {
    if (!isMessageKind(row.kind) || !isChannel(row.channel)) {
      await updateRow(admin, row.id, { status: "skipped", last_error: `unknown_kind_or_channel:${row.kind}/${row.channel}`, locked_at: null });
      summary.skipped++;
      return;
    }
    const kind: MessageKind = row.kind;
    const channel: Channel = row.channel;

    const booking = await getBookingById(row.booking_id);
    const skip = shouldSkip(booking, settings, row);
    if (skip.skip || !booking) {
      const reason = skip.skip ? skip.reason : "booking_not_found";
      await updateRow(admin, row.id, { status: "skipped", last_error: reason, locked_at: null });
      summary.skipped++;
      logger.info(SCOPE, "skipped", { id: row.id, tag, reason });
      return;
    }

    const locale: Locale = toLocale(booking.preferred_lang);
    const built = buildMessage(kind, buildContext(booking, settings, locale), locale);
    const recipient = channel === "email" ? (booking.guest_email ?? "").trim() : booking.guest_phone.trim();
    const outcome = await sendBuilt(channel, recipient, built);
    const attempts = row.attempts + 1;

    if (outcome.stubbed) {
      await writeLog(admin, { booking_id: booking.id, scheduled_id: row.id, channel, kind }, outcome, "stubbed");
      await updateRow(admin, row.id, { status: "stubbed", attempts, last_error: outcome.reason, locked_at: null });
      summary.stubbed++;
      logger.info(SCOPE, "stubbed (provider not configured)", { id: row.id, tag });
      return;
    }

    await writeLog(admin, { booking_id: booking.id, scheduled_id: row.id, channel, kind }, outcome, outcome.ok ? "sent" : "failed");
    await writeCrmMessage(admin, booking, channel, outcome);

    if (outcome.ok) {
      await updateRow(admin, row.id, {
        status: "sent",
        attempts,
        sent_at: new Date().toISOString(),
        last_error: outcome.reason,
        locked_at: null,
      });
      summary.sent++;
      logger.info(SCOPE, "sent", { id: row.id, tag, provider_message_id: outcome.messageId });
      return;
    }

    const retry = decideRetry(attempts, outcome.retryable);
    await updateRow(admin, row.id, {
      status: retry.status,
      attempts,
      last_error: outcome.reason ?? outcome.error,
      locked_at: null,
      ...(retry.status === "pending" ? { send_at: retry.send_at.toISOString() } : {}),
    });
    summary.failed++;
    summary.errors.push(`${tag}: ${outcome.reason ?? outcome.error ?? "unknown"}${retry.status === "pending" ? " (will retry)" : ""}`);
    logger.warn(SCOPE, "send failed", { id: row.id, tag, attempts, retryable: outcome.retryable, next: retry.status, error: outcome.error });
  } catch (e) {
    // Unexpected (DB read, template bug…): never leave the row in `sending`.
    const message = errorMessage(e);
    const attempts = row.attempts + 1;
    const retry = decideRetry(attempts, true);
    await updateRow(admin, row.id, {
      status: retry.status,
      attempts,
      last_error: `internal: ${message}`,
      locked_at: null,
      ...(retry.status === "pending" ? { send_at: retry.send_at.toISOString() } : {}),
    });
    summary.failed++;
    summary.errors.push(`${tag}: internal: ${message}`);
    logger.error(SCOPE, "row processing threw", { id: row.id, tag, error: message });
  }
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

async function runPipeline(admin: Admin, ids: string[], summary: DispatchSummary): Promise<DispatchSummary> {
  const rows = await lockRows(admin, ids);
  summary.picked = rows.length;
  if (rows.length === 0) return summary;

  const settings = await getSettings();
  await runWithConcurrency(rows, CONCURRENCY, (row) => processRow(admin, row, settings, summary));
  return summary;
}

/** Cron entry point: send every pending row whose send_at has passed (oldest first). */
export async function dispatchDueMessages(limit = 50): Promise<DispatchSummary> {
  const summary = emptySummary();
  try {
    const admin = createAdminClient();
    await recoverStaleLocks(admin);

    const { data, error } = await admin
      .from("bk_scheduled_messages")
      .select("id")
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .order("send_at", { ascending: true })
      .limit(Math.max(1, Math.min(limit, 500)));
    if (error) throw new Error(`due query failed: ${error.message}`);

    await runPipeline(admin, (data ?? []).map((r) => r.id), summary);
    logger.info(SCOPE, "dispatchDueMessages done", { ...summary, errors: summary.errors.length });
  } catch (e) {
    const message = errorMessage(e);
    summary.errors.push(`dispatcher: ${message}`);
    logger.error(SCOPE, "dispatchDueMessages failed", { error: message });
  }
  return summary;
}

/**
 * Inline entry point right after booking creation: send this booking's rows of
 * the given kinds that are due now (send_at within the next minute).
 */
export async function dispatchForBooking(
  bookingId: string,
  kinds: MessageKind[] = ["confirmation"]
): Promise<DispatchSummary> {
  const summary = emptySummary();
  if (kinds.length === 0) return summary;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("bk_scheduled_messages")
      .select("id")
      .eq("booking_id", bookingId)
      .in("kind", kinds)
      .eq("status", "pending")
      .lte("send_at", new Date(Date.now() + INLINE_WINDOW_MS).toISOString())
      .order("send_at", { ascending: true });
    if (error) throw new Error(`booking rows query failed: ${error.message}`);

    await runPipeline(admin, (data ?? []).map((r) => r.id), summary);
    logger.info(SCOPE, "dispatchForBooking done", { bookingId, kinds, ...summary, errors: summary.errors.length });
  } catch (e) {
    const message = errorMessage(e);
    summary.errors.push(`dispatcher: ${message}`);
    logger.error(SCOPE, "dispatchForBooking failed", { bookingId, error: message });
  }
  return summary;
}

/**
 * Admin test send: render `kind` with sample data and deliver it to a phone
 * (whatsapp) or an email address. Logged with booking_id null, status `test`.
 */
export async function sendTest(
  kind: MessageKind,
  channel: Channel,
  to: string,
  locale: Locale = "en"
): Promise<DispatchSummary> {
  const summary = emptySummary();
  summary.picked = 1;
  const recipient = to.trim();
  if (!recipient) {
    summary.failed++;
    summary.errors.push("test: recipient is empty");
    return summary;
  }
  try {
    const admin = createAdminClient();
    const settings = await getSettings();
    const built = buildMessage(kind, sampleContext(locale, settings), locale);
    const outcome = await sendBuilt(channel, recipient, built);
    outcome.payload = { ...(outcome.payload as Record<string, Json>), test: true, locale };
    await writeLog(admin, { booking_id: null, scheduled_id: null, channel, kind }, outcome, "test");

    if (outcome.stubbed) {
      summary.stubbed++;
      summary.errors.push(`test ${kind}/${channel}: ${outcome.reason}`);
    } else if (outcome.ok) {
      summary.sent++;
    } else {
      summary.failed++;
      summary.errors.push(`test ${kind}/${channel}: ${outcome.reason ?? outcome.error ?? "unknown"}`);
    }
    logger.info(SCOPE, "sendTest done", { kind, channel, locale, ok: outcome.ok, stubbed: outcome.stubbed });
  } catch (e) {
    const message = errorMessage(e);
    summary.failed++;
    summary.errors.push(`test: ${message}`);
    logger.error(SCOPE, "sendTest failed", { kind, channel, error: message });
  }
  return summary;
}
