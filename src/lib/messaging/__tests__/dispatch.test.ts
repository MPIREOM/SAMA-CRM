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
vi.mock("@/lib/bk/settings", () => ({ getSettings: vi.fn(async () => settings) }));

const sendWhatsApp = vi.fn();
vi.mock("../providers/whatsapp", () => ({ sendWhatsApp: (...args: unknown[]) => sendWhatsApp(...args) }));
const sendGuestEmail = vi.fn();
vi.mock("../providers/email", () => ({ sendGuestEmail: (...args: unknown[]) => sendGuestEmail(...args) }));

import { dispatchDueMessages, dispatchForBooking, sendTest } from "../dispatch";

// --- Fixtures ---------------------------------------------------------------
const B1 = "00000000-0000-4000-8000-000000000001";
const B2 = "00000000-0000-4000-8000-000000000002";
const CONTACT = "00000000-0000-4000-8000-0000000000c1";

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

function scheduled(
  id: string,
  booking_id: string,
  channel: "email" | "whatsapp",
  kind: string,
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    booking_id,
    channel,
    kind,
    send_at: minutesAgo(1),
    status: "pending",
    attempts: 0,
    last_error: null,
    sent_at: null,
    locked_at: null,
    created_at: minutesAgo(5),
    updated_at: minutesAgo(5),
    ...extra,
  };
}

const okWa = { ok: true, stubbed: false, messageId: "wamid.1", error: null, reason: null, retryable: false, code: null };
const okEmail = { ok: true, stubbed: false, messageId: "em_1", error: null, reason: null, retryable: false, fallback_sender: false };

let tables: FakeTables;

beforeEach(() => {
  tables = { bk_scheduled_messages: [], bk_message_log: [], messages: [] };
  admin = createFakeAdmin(tables);
  bookings.clear();
  const b1 = { ...sampleBooking("en"), id: B1, contact_id: CONTACT };
  const b2 = { ...sampleBooking("ar"), id: B2, ref: "SAMA-26-AR0001", contact_id: CONTACT };
  bookings.set(B1, b1);
  bookings.set(B2, b2);
  settings.messaging.email_enabled = true;
  settings.messaging.whatsapp_enabled = true;
  sendWhatsApp.mockReset().mockResolvedValue(okWa);
  sendGuestEmail.mockReset().mockResolvedValue(okEmail);
});

function row(id: string) {
  const r = tables.bk_scheduled_messages.find((x) => x.id === id);
  if (!r) throw new Error(`row ${id} missing`);
  return r;
}

// --- Tests ------------------------------------------------------------------
describe("dispatchDueMessages", () => {
  it("locks due rows, sends both channels, logs, mirrors to CRM messages", async () => {
    tables.bk_scheduled_messages.push(
      scheduled("s1", B1, "whatsapp", "confirmation"),
      scheduled("s2", B1, "email", "confirmation"),
      scheduled("s3", B1, "whatsapp", "pre_arrival", { send_at: new Date(Date.now() + 3600_000).toISOString() }) // future
    );

    const summary = await dispatchDueMessages(50);
    expect(summary).toMatchObject({ picked: 2, sent: 2, failed: 0, stubbed: 0, skipped: 0, errors: [] });

    expect(row("s1")).toMatchObject({ status: "sent", attempts: 1, locked_at: null });
    expect(row("s1").sent_at).toBeTruthy();
    expect(row("s2")).toMatchObject({ status: "sent", attempts: 1 });
    expect(row("s3")).toMatchObject({ status: "pending", attempts: 0 });

    // WhatsApp call shape: phone, template, lang, 7 params
    const [phone, template, lang, params] = sendWhatsApp.mock.calls[0] as [string, string, string, string[]];
    expect(phone).toBe("+96899123456");
    expect(template).toBe("sama_booking_confirmation");
    expect(lang).toBe("en");
    expect(params).toHaveLength(7);
    expect(params[1]).toBe("SAMA-26-K7P3QX");

    // Email call shape
    const [to, subject, html, text] = sendGuestEmail.mock.calls[0] as [string, string, string, string];
    expect(to).toBe("guest@example.com");
    expect(subject).toContain("SAMA-26-K7P3QX");
    expect(html).toContain("Pay at the hotel");
    expect(text).toContain("Pay at the hotel");

    // Logs: one per attempt
    expect(tables.bk_message_log).toHaveLength(2);
    const waLog = tables.bk_message_log.find((l) => l.channel === "whatsapp");
    expect(waLog).toMatchObject({
      booking_id: B1,
      scheduled_id: "s1",
      kind: "confirmation",
      recipient: "+96899123456",
      provider_message_id: "wamid.1",
      status: "sent",
    });
    expect((waLog?.payload as { template: string; params: string[] }).params).toHaveLength(7);
    const emLog = tables.bk_message_log.find((l) => l.channel === "email");
    expect((emLog?.payload as { subject: string; fallback_sender: boolean }).fallback_sender).toBe(false);

    // CRM inbox rows
    expect(tables.messages).toHaveLength(2);
    expect(tables.messages[0]).toMatchObject({ contact_id: CONTACT, booking_id: B1, direction: "outbound", status: "sent" });
    const waMsg = tables.messages.find((m) => m.channel === "whatsapp");
    expect(String(waMsg?.body)).toContain("Booking ref: SAMA-26-K7P3QX");
    expect(waMsg?.provider_msg_id).toBe("wamid.1");
  });

  it("never processes a row another worker locked first (atomic lock)", async () => {
    tables.bk_scheduled_messages.push(scheduled("s1", B1, "whatsapp", "confirmation"), scheduled("s2", B1, "email", "confirmation"));
    // Simulate a concurrent dispatcher winning s1 between our SELECT and UPDATE.
    admin = createFakeAdmin(tables, {
      beforeUpdate: (table, rows, patch) =>
        table === "bk_scheduled_messages" && patch.status === "sending" ? rows.filter((r) => r.id === "s1") : undefined,
    });

    const summary = await dispatchDueMessages(50);
    expect(summary.picked).toBe(1);
    expect(summary.sent).toBe(1);
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(sendGuestEmail).toHaveBeenCalledTimes(1);
    expect(row("s1").status).toBe("pending"); // untouched by us
  });

  it("recovers stale `sending` rows (>10 min) and leaves fresh locks alone", async () => {
    tables.bk_scheduled_messages.push(
      scheduled("stale", B1, "whatsapp", "confirmation", { status: "sending", locked_at: minutesAgo(11) }),
      scheduled("fresh", B1, "email", "confirmation", { status: "sending", locked_at: minutesAgo(2) })
    );
    const summary = await dispatchDueMessages(50);
    expect(summary.picked).toBe(1);
    expect(row("stale").status).toBe("sent");
    expect(row("fresh").status).toBe("sending");
  });

  it("skips cancelled bookings, disabled channels and missing addresses with a reason", async () => {
    const cancelled = { ...sampleBooking("en"), id: B1, status: "cancelled" };
    bookings.set(B1, cancelled);
    settings.messaging.email_enabled = false;
    const noPhone = { ...sampleBooking("en"), id: B2, guest_phone: "", guest_email: "x@example.com" };
    bookings.set(B2, noPhone);
    tables.bk_scheduled_messages.push(
      scheduled("s1", B1, "whatsapp", "confirmation"),
      scheduled("s2", B2, "email", "confirmation"),
      scheduled("s3", B2, "whatsapp", "confirmation")
    );

    const summary = await dispatchDueMessages(50);
    expect(summary).toMatchObject({ picked: 3, skipped: 3, sent: 0 });
    expect(row("s1")).toMatchObject({ status: "skipped", last_error: "booking_cancelled" });
    expect(row("s2")).toMatchObject({ status: "skipped", last_error: "email_disabled" });
    expect(row("s3")).toMatchObject({ status: "skipped", last_error: "no_phone" });
    expect(tables.bk_message_log).toHaveLength(0);
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it("marks stubbed sends as `stubbed` with a log row and no CRM message", async () => {
    sendWhatsApp.mockResolvedValue({ ...okWa, ok: false, stubbed: true, messageId: null, reason: "stubbed: WhatsApp credentials not configured" });
    tables.bk_scheduled_messages.push(scheduled("s1", B1, "whatsapp", "confirmation"));
    const summary = await dispatchDueMessages(50);
    expect(summary).toMatchObject({ picked: 1, stubbed: 1, sent: 0, failed: 0 });
    expect(row("s1")).toMatchObject({ status: "stubbed", attempts: 1 });
    expect(tables.bk_message_log[0]).toMatchObject({ status: "stubbed", scheduled_id: "s1" });
    expect(tables.messages).toHaveLength(0);
  });

  it("schedules a retry (+5 min) on a retryable failure and fails hard on a non-retryable one", async () => {
    sendWhatsApp
      .mockResolvedValueOnce({ ...okWa, ok: false, messageId: null, error: "(#130429) Rate limit hit", reason: "Rate limited by Meta", retryable: true, code: 130429 })
      .mockResolvedValueOnce({ ...okWa, ok: false, messageId: null, error: "(#132001) nope", reason: "Template sama_pre_arrival_guide (en) is not approved in Meta", retryable: false, code: 132001 });
    tables.bk_scheduled_messages.push(scheduled("s1", B1, "whatsapp", "confirmation"), scheduled("s2", B1, "whatsapp", "pre_arrival"));

    const before = Date.now();
    const summary = await dispatchDueMessages(50);
    expect(summary).toMatchObject({ picked: 2, failed: 2, sent: 0 });
    expect(summary.errors).toHaveLength(2);

    const retry = row("s1");
    expect(retry).toMatchObject({ status: "pending", attempts: 1, last_error: "Rate limited by Meta", locked_at: null });
    const sendAt = Date.parse(String(retry.send_at));
    expect(sendAt).toBeGreaterThanOrEqual(before + 5 * 60_000 - 1000);
    expect(sendAt).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 1000);

    expect(row("s2")).toMatchObject({ status: "failed", attempts: 1 });
    expect(String(row("s2").last_error)).toContain("not approved in Meta");

    // Both attempts logged as failed, both mirrored to the CRM as failed.
    expect(tables.bk_message_log.map((l) => l.status)).toEqual(["failed", "failed"]);
    expect(tables.messages.map((m) => m.status)).toEqual(["failed", "failed"]);
    expect(String(tables.messages[0].body)).toContain("[error:");
  });

  it("gives up after the backoff ladder is exhausted", async () => {
    sendGuestEmail.mockResolvedValue({ ...okEmail, ok: false, messageId: null, error: "503", reason: "Temporary Resend error", retryable: true });
    tables.bk_scheduled_messages.push(scheduled("s1", B1, "email", "confirmation", { attempts: 3 }));
    await dispatchDueMessages(50);
    expect(row("s1")).toMatchObject({ status: "failed", attempts: 4 });
  });

  it("never throws when a provider or the booking read blows up; row is retried later", async () => {
    sendWhatsApp.mockRejectedValue(new Error("boom"));
    tables.bk_scheduled_messages.push(scheduled("s1", B1, "whatsapp", "confirmation"));
    const summary = await dispatchDueMessages(50);
    expect(summary.failed).toBe(1);
    expect(summary.errors[0]).toContain("internal: boom");
    expect(row("s1")).toMatchObject({ status: "pending", attempts: 1 });
    expect(String(row("s1").last_error)).toContain("internal: boom");
  });

  it("uses the guest's preferred language", async () => {
    tables.bk_scheduled_messages.push(scheduled("s1", B2, "whatsapp", "post_stay"));
    await dispatchDueMessages(50);
    const [, template, lang, params] = sendWhatsApp.mock.calls[0] as [string, string, string, string[]];
    expect(template).toBe("sama_post_stay_review");
    expect(lang).toBe("ar");
    expect(params).toEqual(["أحمد النبهاني", SAMPLE_SETTINGS.contact.website]);
  });
});

describe("dispatchForBooking", () => {
  it("processes only this booking's rows of the given kinds that are due within a minute", async () => {
    tables.bk_scheduled_messages.push(
      scheduled("c-wa", B1, "whatsapp", "confirmation", { send_at: new Date().toISOString() }),
      scheduled("c-em", B1, "email", "confirmation", { send_at: new Date().toISOString() }),
      scheduled("pre", B1, "whatsapp", "pre_arrival", { send_at: new Date(Date.now() + 3 * 60_000).toISOString() }),
      scheduled("other", B2, "whatsapp", "confirmation")
    );
    const summary = await dispatchForBooking(B1, ["confirmation"]);
    expect(summary).toMatchObject({ picked: 2, sent: 2 });
    expect(row("c-wa").status).toBe("sent");
    expect(row("c-em").status).toBe("sent");
    expect(row("pre").status).toBe("pending");
    expect(row("other").status).toBe("pending");
  });

  it("returns an empty summary for no kinds / nothing due", async () => {
    expect(await dispatchForBooking(B1, [])).toEqual({ picked: 0, sent: 0, failed: 0, stubbed: 0, skipped: 0, errors: [] });
    expect((await dispatchForBooking(B1)).picked).toBe(0);
  });
});

describe("sendTest", () => {
  it("sends sample data to the given recipient and logs a `test` row without a booking", async () => {
    const summary = await sendTest("confirmation", "whatsapp", "+96899475688", "ar");
    expect(summary).toMatchObject({ picked: 1, sent: 1 });
    const [phone, template, lang, params] = sendWhatsApp.mock.calls[0] as [string, string, string, string[]];
    expect(phone).toBe("+96899475688");
    expect(template).toBe("sama_booking_confirmation");
    expect(lang).toBe("ar");
    expect(params).toHaveLength(7);
    expect(tables.bk_message_log[0]).toMatchObject({ booking_id: null, scheduled_id: null, status: "test", channel: "whatsapp" });
    expect((tables.bk_message_log[0].payload as { test: boolean }).test).toBe(true);
    expect(tables.messages).toHaveLength(0);
  });

  it("reports stubbed / failed test sends in the summary", async () => {
    sendGuestEmail.mockResolvedValue({ ...okEmail, ok: false, stubbed: true, messageId: null, reason: "stubbed: RESEND_API_KEY not configured" });
    const s = await sendTest("post_stay", "email", "me@example.com");
    expect(s).toMatchObject({ picked: 1, stubbed: 1, sent: 0 });
    expect(s.errors[0]).toContain("stubbed");
    expect(tables.bk_message_log[0]).toMatchObject({ status: "test", error: "stubbed: RESEND_API_KEY not configured" });
  });
});
