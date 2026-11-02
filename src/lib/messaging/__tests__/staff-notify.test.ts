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

import { MAX_STAFF_ALERT_FAILURES, notifyStaffNewBooking, notifyStaffPendingBookings, sendStaffNewBookingTest, STAFF_NEW_BOOKING_KIND } from "../staff-notify";

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
  tables = { bk_scheduled_messages: [], bk_message_log: [], messages: [], contacts: [], bk_bookings: [] };
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
    missed: "00000000-0000-4000-8000-00000000000b", // 30 min old, no log → send
    partial: "00000000-0000-4000-8000-00000000000c", // desk has it, manager does not → send to manager
    done: "00000000-0000-4000-8000-00000000000d", // everyone has it → skip
    givenUp: "00000000-0000-4000-8000-00000000000e", // too many failures → skip
    old: "00000000-0000-4000-8000-00000000000f", // 3 days old → outside the window
  };

  beforeEach(() => {
    const row = (id: string, minutes: number) => ({ id, ref: `REF-${id.slice(-1)}`, created_at: minutesAgo(minutes) });
    tables.bk_bookings!.push(row(ids.fresh, 2), row(ids.missed, 30), row(ids.partial, 60), row(ids.done, 90), row(ids.givenUp, 120), row(ids.old, 3 * 24 * 60));
    for (const id of Object.values(ids)) bookings.set(id, { ...sampleBooking("en"), id, ref: `REF-${id.slice(-1)}` });
    const log = (booking_id: string, recipient: string, status: string) => ({ booking_id, recipient, status, kind: STAFF_NEW_BOOKING_KIND, channel: "email" });
    tables.bk_message_log.push(
      log(ids.partial, DESK, "sent"),
      log(ids.done, DESK, "sent"),
      log(ids.done, MANAGER, "sent"),
      ...Array.from({ length: MAX_STAFF_ALERT_FAILURES }, () => log(ids.givenUp, DESK, "failed"))
    );
  });

  it("re-sends what is missing inside the 10 min – 48 h window and nothing else", async () => {
    const summary = await notifyStaffPendingBookings();
    expect(summary).toMatchObject({ checked: 4, sent: 2, failed: 0, skipped: 1, errors: [] });

    // Oldest first: partial (60 min) → manager only, then missed (30 min) → both.
    const sentTo = (sendGuestEmail.mock.calls as string[][]).map((c) => c[0]);
    expect(sentTo).toEqual([MANAGER, DESK, MANAGER]);
    const newRows = logRows().filter((l) => l.provider_message_id === "em_1");
    expect(newRows.map((l) => [l.booking_id, l.recipient])).toEqual([
      [ids.partial, MANAGER],
      [ids.missed, DESK],
      [ids.missed, MANAGER],
    ]);
    expect(logRows().some((l) => l.booking_id === ids.fresh || l.booking_id === ids.old)).toBe(false);
  });

  it("counts failures and keeps trying the next run until the cap", async () => {
    sendGuestEmail.mockResolvedValue(failedEmail);
    const summary = await notifyStaffPendingBookings();
    expect(summary.failed).toBe(2);
    expect(summary.errors).toEqual(["REF-c: resend_5xx", "REF-b: resend_5xx"]);
  });

  it("stays quiet when email is not configured or the alert is off", async () => {
    configured = false;
    expect(await notifyStaffPendingBookings()).toMatchObject({ checked: 0, sent: 0 });
    configured = true;
    settings.messaging.notify_new_booking = false;
    expect(await notifyStaffPendingBookings()).toMatchObject({ checked: 0, sent: 0 });
    expect(sendGuestEmail).not.toHaveBeenCalled();
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
