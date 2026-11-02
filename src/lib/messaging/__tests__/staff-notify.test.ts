import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingWithRelations } from "@/lib/bk/bookings";
import { createFakeAdmin, type FakeAdmin, type FakeTables } from "./fake-admin";
import { sampleBooking, SAMPLE_SETTINGS } from "../templates";

vi.mock("server-only", () => ({}));

// --- Mocks -----------------------------------------------------------------
let admin: FakeAdmin;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

const bookings = new Map<string, BookingWithRelations | null>();
vi.mock("@/lib/bk/bookings", () => ({
  getBookingById: vi.fn(async (id: string) => bookings.get(id) ?? null),
}));

const settings = { ...SAMPLE_SETTINGS, messaging: { ...SAMPLE_SETTINGS.messaging } };
const getSettings = vi.fn(async () => settings);
vi.mock("@/lib/bk/settings", () => ({ getSettings: () => getSettings() }));

const sendGuestEmail = vi.fn();
let configured = true;
vi.mock("../providers/email", () => ({
  sendGuestEmail: (...args: unknown[]) => sendGuestEmail(...args),
  emailConfigured: () => configured,
}));

import {
  CATCH_UP_LOCK_KEY,
  CATCH_UP_LOCK_TTL_MS,
  MAX_STAFF_ALERT_FAILURES,
  notifyStaffNewBooking,
  notifyStaffPendingBookings,
  sendStaffNewBookingTest,
  STAFF_NEW_BOOKING_KIND,
} from "../staff-notify";

// --- Fixtures ---------------------------------------------------------------
const B1 = "00000000-0000-4000-8000-000000000001";
const DESK = "reservations@samahotel.net";
const MANAGER = "manager@samahotel.net";

const okEmail = { ok: true, stubbed: false, messageId: "em_1", error: null, reason: null, retryable: false, fallback_sender: false };
const failedEmail = { ok: false, stubbed: false, messageId: null, error: "Resend 500", reason: "resend_5xx", retryable: true, fallback_sender: false };
const stubbedEmail = { ok: false, stubbed: true, messageId: null, error: "Resend is not configured (RESEND_API_KEY).", reason: "stubbed: RESEND_API_KEY not configured", retryable: false, fallback_sender: false };

let tables: FakeTables;

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

function logRows() {
  return tables.bk_message_log.filter((l) => l.kind === STAFF_NEW_BOOKING_KIND);
}

beforeEach(() => {
  tables = { bk_scheduled_messages: [], bk_message_log: [], messages: [], contacts: [], bk_bookings: [], bk_settings: [] };
  admin = createFakeAdmin(tables);
  bookings.clear();
  bookings.set(B1, { ...sampleBooking("en"), id: B1 });
  settings.messaging.notify_new_booking = true;
  settings.messaging.notify_email = `${DESK}, ${MANAGER}`;
  configured = true;
  getSettings.mockClear();
  sendGuestEmail.mockReset().mockResolvedValue(okEmail);
});

// --- notifyStaffNewBooking -----------------------------------------------
describe("notifyStaffNewBooking", () => {
  it("emails every configured address with the full booking and logs one row per recipient", async () => {
    const r = await notifyStaffNewBooking(B1);
    expect(r).toMatchObject({ status: "sent", recipients: [DESK, MANAGER], error: null });
    expect(r.delivered.sort()).toEqual([DESK, MANAGER].sort());

    expect(sendGuestEmail).toHaveBeenCalledTimes(2);
    const [to, subject, html, text] = sendGuestEmail.mock.calls[0] as [string, string, string, string];
    expect(to).toBe(DESK);
    expect(subject).toBe("New booking SAMA-26-K7P3QX · Deluxe Room — Mountain & Sunset View · 17–19 Sep 2026 · OMR 180.232");
    expect(html).toContain("+96899123456");
    expect(html).toContain("APEX Zipline × 2");
    expect(html).toContain(`/reservations/${B1}`);
    expect(text).toContain("High floor if possible");

    const rows = logRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((l) => l.recipient)).toEqual([DESK, MANAGER]);
    expect(rows[0]).toMatchObject({ booking_id: B1, scheduled_id: null, channel: "email", status: "sent", provider_message_id: "em_1", error: null });
    expect(rows[0].payload).toMatchObject({ subject, ref: "SAMA-26-K7P3QX", source: "website", fallback_sender: false });
  });

  it("does nothing when the alert is switched off", async () => {
    settings.messaging.notify_new_booking = false;
    expect(await notifyStaffNewBooking(B1)).toMatchObject({ status: "disabled", recipients: [] });
    expect(sendGuestEmail).not.toHaveBeenCalled();
    expect(logRows()).toHaveLength(0);
  });

  it("reports a missing or invalid address instead of sending", async () => {
    settings.messaging.notify_email = "front desk";
    expect((await notifyStaffNewBooking(B1)).status).toBe("no_recipient");
    expect(sendGuestEmail).not.toHaveBeenCalled();
  });

  it("logs stubbed rows when email is not configured, so the emulator and the log still show the attempt", async () => {
    sendGuestEmail.mockResolvedValue(stubbedEmail);
    const r = await notifyStaffNewBooking(B1);
    expect(r.status).toBe("stubbed");
    expect(logRows().map((l) => l.status)).toEqual(["stubbed", "stubbed"]);
    expect(logRows()[0].error).toContain("RESEND_API_KEY");
  });

  it("re-sends only to the addresses that have not got it yet; force re-sends to everyone", async () => {
    sendGuestEmail.mockResolvedValueOnce(okEmail).mockResolvedValueOnce(failedEmail);
    const first = await notifyStaffNewBooking(B1);
    expect(first).toMatchObject({ status: "failed", delivered: [DESK], error: "resend_5xx" });
    expect(logRows().map((l) => [l.recipient, l.status])).toEqual([
      [DESK, "sent"],
      [MANAGER, "failed"],
    ]);

    sendGuestEmail.mockClear().mockResolvedValue(okEmail);
    const second = await notifyStaffNewBooking(B1);
    expect(second).toMatchObject({ status: "sent", recipients: [MANAGER] });
    expect(sendGuestEmail).toHaveBeenCalledTimes(1);
    expect((sendGuestEmail.mock.calls[0] as string[])[0]).toBe(MANAGER);

    expect(await notifyStaffNewBooking(B1)).toMatchObject({ status: "already_sent", recipients: [] });

    sendGuestEmail.mockClear();
    const forced = await notifyStaffNewBooking(B1, { force: true });
    expect(forced.recipients).toEqual([DESK, MANAGER]);
    expect(sendGuestEmail).toHaveBeenCalledTimes(2);
  });

  it("leaves an address alone once it failed the maximum number of times", async () => {
    for (let i = 0; i < MAX_STAFF_ALERT_FAILURES; i++) {
      tables.bk_message_log.push({ booking_id: B1, recipient: DESK, status: "failed", kind: STAFF_NEW_BOOKING_KIND, channel: "email", payload: { recipients: [DESK, MANAGER] } });
    }
    const r = await notifyStaffNewBooking(B1);
    expect(r).toMatchObject({ status: "sent", recipients: [MANAGER] });
    expect(sendGuestEmail).toHaveBeenCalledTimes(1);
  });

  it("does not back-fill an address that was added after the booking was announced", async () => {
    tables.bk_message_log.push({ booking_id: B1, recipient: DESK, status: "sent", kind: STAFF_NEW_BOOKING_KIND, channel: "email", payload: { recipients: [DESK] } });
    expect(await notifyStaffNewBooking(B1)).toMatchObject({ status: "already_sent", recipients: [], delivered: [DESK] });
    expect(sendGuestEmail).not.toHaveBeenCalled();
    // …unless forced.
    expect((await notifyStaffNewBooking(B1, { force: true })).recipients).toEqual([DESK, MANAGER]);
  });

  it("never throws: unknown booking and a settings outage come back as statuses", async () => {
    expect((await notifyStaffNewBooking("missing")).status).toBe("booking_not_found");
    getSettings.mockRejectedValueOnce(new Error("db down"));
    expect(await notifyStaffNewBooking(B1)).toMatchObject({ status: "error", error: "db down" });
  });
});

// --- notifyStaffPendingBookings -------------------------------------------
describe("notifyStaffPendingBookings (cron catch-up)", () => {
  const ids = {
    fresh: "00000000-0000-4000-8000-00000000000a", // 2 min old — inline send may still be running
    missed: "00000000-0000-4000-8000-00000000000b", // 30 min old, no log → both addresses
    partial: "00000000-0000-4000-8000-00000000000c", // desk has it, manager does not → manager only
    done: "00000000-0000-4000-8000-00000000000d", // everyone has it → nothing
    givenUp: "00000000-0000-4000-8000-00000000000e", // both addresses failed 3× → given up, counted as skipped
    capped: "00000000-0000-4000-8000-00000000000f", // desk failed 3×, manager never tried → manager only
    added: "00000000-0000-4000-8000-000000000011", // desk got it when it was the only address; manager added later → nothing
    old: "00000000-0000-4000-8000-000000000010", // 3 days old → outside the window
  };
  const refs: Record<string, string> = {
    [ids.fresh]: "REF-FRESH",
    [ids.missed]: "REF-MISSED",
    [ids.partial]: "REF-PARTIAL",
    [ids.done]: "REF-DONE",
    [ids.givenUp]: "REF-GIVENUP",
    [ids.capped]: "REF-CAPPED",
    [ids.added]: "REF-ADDED",
    [ids.old]: "REF-OLD",
  };

  beforeEach(() => {
    const row = (id: string, minutes: number) => ({ id, ref: refs[id], created_at: minutesAgo(minutes) });
    tables.bk_bookings!.push(row(ids.fresh, 2), row(ids.missed, 30), row(ids.partial, 60), row(ids.done, 90), row(ids.givenUp, 120), row(ids.capped, 150), row(ids.added, 180), row(ids.old, 3 * 24 * 60));
    for (const id of Object.values(ids)) bookings.set(id, { ...sampleBooking("en"), id, ref: refs[id] });
    // Every row records the list that attempt was meant for (payload.recipients).
    const log = (booking_id: string, recipient: string, status: string, planned: string[] = [DESK, MANAGER]) => ({
      booking_id,
      recipient,
      status,
      kind: STAFF_NEW_BOOKING_KIND,
      channel: "email",
      payload: { recipients: planned },
    });
    const failures = (booking_id: string, recipient: string) => Array.from({ length: MAX_STAFF_ALERT_FAILURES }, () => log(booking_id, recipient, "failed"));
    tables.bk_message_log.push(
      log(ids.partial, DESK, "sent"), // crashed before the manager's turn
      log(ids.done, DESK, "sent"),
      log(ids.done, MANAGER, "sent"),
      ...failures(ids.givenUp, DESK),
      ...failures(ids.givenUp, MANAGER),
      ...failures(ids.capped, DESK), // the manager's row was never written
      log(ids.added, DESK, "sent", [DESK]) // sent when the list was just the desk; manager added afterwards
    );
  });

  it("re-sends only what is owed inside the 10 min – 48 h window, oldest booking first", async () => {
    const summary = await notifyStaffPendingBookings();
    expect(summary).toMatchObject({ checked: 6, sent: 3, failed: 0, skipped: 1, locked: false, errors: [] });

    // capped (150 min) → manager; partial (60) → manager; missed (30) → desk + manager.
    const sentTo = (sendGuestEmail.mock.calls as string[][]).map((c) => c[0]);
    expect(sentTo).toEqual([MANAGER, MANAGER, DESK, MANAGER]);
    const newRows = logRows().filter((l) => l.provider_message_id === "em_1");
    expect(newRows.map((l) => [l.booking_id, l.recipient])).toEqual([
      [ids.capped, MANAGER],
      [ids.partial, MANAGER],
      [ids.missed, DESK],
      [ids.missed, MANAGER],
    ]);
    expect(logRows().some((l) => [ids.fresh, ids.old, ids.done, ids.givenUp, ids.added].includes(l.booking_id as string) && l.provider_message_id === "em_1")).toBe(false);
    // Rows record the list they were meant for, so a later run knows what was planned.
    expect(newRows[2].payload).toMatchObject({ recipients: [DESK, MANAGER] });
  });

  it("counts failures per address and keeps trying the next run until the cap", async () => {
    sendGuestEmail.mockResolvedValue(failedEmail);
    const summary = await notifyStaffPendingBookings();
    expect(summary.failed).toBe(3);
    expect(summary.errors).toEqual(["REF-CAPPED: resend_5xx", "REF-PARTIAL: resend_5xx", "REF-MISSED: resend_5xx"]);
    // The desk address of `capped` was already at the cap: not tried again.
    expect(logRows().filter((l) => l.booking_id === ids.capped && l.recipient === DESK)).toHaveLength(MAX_STAFF_ALERT_FAILURES);
  });

  it("takes a lock so two overlapping cron runs never both send", async () => {
    const now = new Date();
    // A fresh claim by the other runner → this run steps aside.
    tables.bk_settings!.push({ key: CATCH_UP_LOCK_KEY, value: { locked_at: now.toISOString() }, updated_at: new Date(now.getTime() - 30_000).toISOString(), updated_by: null });
    expect(await notifyStaffPendingBookings(now)).toMatchObject({ locked: true, checked: 0, sent: 0 });
    expect(sendGuestEmail).not.toHaveBeenCalled();

    // An expired claim is taken over and refreshed.
    tables.bk_settings![0].updated_at = new Date(now.getTime() - CATCH_UP_LOCK_TTL_MS - 1000).toISOString();
    const second = await notifyStaffPendingBookings(now);
    expect(second.locked).toBe(false);
    expect(second.sent).toBe(3);
    expect(tables.bk_settings![0].updated_at).toBe(now.toISOString());

    // Straight after, the lock is still held.
    sendGuestEmail.mockClear();
    expect((await notifyStaffPendingBookings(new Date(now.getTime() + 1000))).locked).toBe(true);
    expect(sendGuestEmail).not.toHaveBeenCalled();
  });

  it("creates the lock row on first use", async () => {
    expect(tables.bk_settings).toHaveLength(0);
    const summary = await notifyStaffPendingBookings();
    expect(summary.locked).toBe(false);
    expect(tables.bk_settings).toHaveLength(1);
    expect(tables.bk_settings![0].key).toBe(CATCH_UP_LOCK_KEY);
  });

  it("stays quiet when email is not configured or the alert is off", async () => {
    configured = false;
    expect(await notifyStaffPendingBookings()).toMatchObject({ checked: 0, sent: 0 });
    configured = true;
    settings.messaging.notify_new_booking = false;
    expect(await notifyStaffPendingBookings()).toMatchObject({ checked: 0, sent: 0 });
    expect(sendGuestEmail).not.toHaveBeenCalled();
    expect(tables.bk_settings).toHaveLength(0); // no lock taken when there is nothing to do
  });
});

// --- sendStaffNewBookingTest ------------------------------------------------
describe("sendStaffNewBookingTest", () => {
  it("sends the sample booking and logs it as a test without a booking id", async () => {
    const r = await sendStaffNewBookingTest([DESK]);
    expect(r).toEqual({ ok: true, stubbed: false, error: null });
    expect(logRows()).toHaveLength(1);
    expect(logRows()[0]).toMatchObject({ booking_id: null, recipient: DESK, status: "test" });
    expect(logRows()[0].payload).toMatchObject({ test: true, ref: "SAMA-26-K7P3QX" });
    const [, subject, html] = sendGuestEmail.mock.calls[0] as [string, string, string];
    expect(subject.startsWith("TEST · ")).toBe(true);
    expect(html).toContain("Test message — not a real booking");
  });

  it("tells the admin when nothing could go out", async () => {
    sendGuestEmail.mockResolvedValue(stubbedEmail);
    expect(await sendStaffNewBookingTest([DESK])).toMatchObject({ ok: false, stubbed: true });
    sendGuestEmail.mockResolvedValue(failedEmail);
    expect(await sendStaffNewBookingTest([DESK])).toMatchObject({ ok: false, stubbed: false, error: "resend_5xx" });
  });
});
