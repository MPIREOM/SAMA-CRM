import { beforeEach, describe, expect, it, vi } from "vitest";

// Server-action layer of the desk alert: role guard, validation codes, what is
// persisted and what is not. Everything below the action is mocked.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/components/admin/messaging/preview-adapter", () => ({ sendTestSafe: vi.fn() }));
vi.mock("@/lib/phone", () => ({ normalizePhone: (v: string) => v }));

let role: "super_admin" | "reservation_desk" = "super_admin";
vi.mock("@/lib/bk/staff", () => ({
  ADMIN_ROLES: ["super_admin"],
  FRONT_DESK_ROLES: ["super_admin", "reservation_desk"],
  requireStaff: vi.fn(async (allowed: string[]) => {
    if (!allowed.includes(role)) throw new Error("forbidden");
    return { actor: { userId: "u1", email: "admin@sama.test" }, role };
  }),
}));

const updateSetting = vi.fn(async () => ({}));
vi.mock("@/lib/bk/settings", () => ({ updateSetting: (...args: unknown[]) => updateSetting(...(args as [])) }));
const audit = vi.fn(async () => undefined);
vi.mock("@/lib/bk/audit", () => ({ audit: (...args: unknown[]) => audit(...(args as [])) }));
const sendStaffNewBookingTest = vi.fn();
vi.mock("@/lib/messaging/staff-notify", () => ({ sendStaffNewBookingTest: (...args: unknown[]) => sendStaffNewBookingTest(...(args as [])) }));

import { saveStaffAlert, sendStaffAlertTest } from "../actions";

beforeEach(() => {
  role = "super_admin";
  updateSetting.mockClear();
  audit.mockClear();
  sendStaffNewBookingTest.mockReset().mockResolvedValue({ ok: true, stubbed: false, error: null });
});

describe("saveStaffAlert", () => {
  it("stores the normalised list and echoes it back", async () => {
    const r = await saveStaffAlert({ enabled: true, email: " Reservations@samahotel.net;reservations@samahotel.net , ops@samahotel.net " });
    expect(r).toEqual({ ok: true, data: { email: "Reservations@samahotel.net, ops@samahotel.net" } });
    expect(updateSetting).toHaveBeenCalledWith("messaging", { notify_new_booking: true, notify_email: "Reservations@samahotel.net, ops@samahotel.net" }, "u1");
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("can be switched off with an empty list, but not on", async () => {
    expect(await saveStaffAlert({ enabled: false, email: "" })).toMatchObject({ ok: true, data: { email: "" } });
    expect(updateSetting).toHaveBeenLastCalledWith("messaging", { notify_new_booking: false, notify_email: "" }, "u1");
    updateSetting.mockClear();
    expect(await saveStaffAlert({ enabled: true, email: "" })).toEqual({ ok: false, error: "recipient_required" });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("answers with codes, never with the typed text", async () => {
    expect(await saveStaffAlert({ enabled: true, email: "a@x.com, overlap" })).toEqual({ ok: false, error: "invalid_recipient" });
    const six = Array.from({ length: 6 }, (_, i) => `a${i}@x.com`).join(", ");
    expect(await saveStaffAlert({ enabled: true, email: six })).toEqual({ ok: false, error: "too_many_recipients" });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("refuses the front desk", async () => {
    role = "reservation_desk";
    expect(await saveStaffAlert({ enabled: true, email: "a@x.com" })).toEqual({ ok: false, error: "forbidden" });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("rejects malformed input through the action contract", async () => {
    const r = await saveStaffAlert({ enabled: "yes" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^validation:/);
  });
});

describe("sendStaffAlertTest", () => {
  it("sends to the typed addresses without touching the saved list", async () => {
    const r = await sendStaffAlertTest({ email: "me@sama.test; you@sama.test" });
    expect(r).toEqual({ ok: true, data: { stubbed: false } });
    expect(sendStaffNewBookingTest).toHaveBeenCalledWith(["me@sama.test", "you@sama.test"]);
    expect(updateSetting).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.anything(), "messaging.staff_alert_test", "bk_settings", "messaging", expect.objectContaining({ to: ["me@sama.test", "you@sama.test"], ok: true }));
  });

  it("reports a stubbed provider and a failed send", async () => {
    sendStaffNewBookingTest.mockResolvedValueOnce({ ok: false, stubbed: true, error: "stubbed" });
    expect(await sendStaffAlertTest({ email: "me@sama.test" })).toEqual({ ok: true, data: { stubbed: true } });
    sendStaffNewBookingTest.mockResolvedValueOnce({ ok: false, stubbed: false, error: "resend_5xx" });
    expect(await sendStaffAlertTest({ email: "me@sama.test" })).toEqual({ ok: false, error: "resend_5xx" });
  });

  it("validates like Save and refuses the front desk", async () => {
    expect(await sendStaffAlertTest({ email: "" })).toEqual({ ok: false, error: "recipient_required" });
    expect(await sendStaffAlertTest({ email: "nope" })).toEqual({ ok: false, error: "invalid_recipient" });
    role = "reservation_desk";
    expect(await sendStaffAlertTest({ email: "me@sama.test" })).toEqual({ ok: false, error: "forbidden" });
    expect(sendStaffNewBookingTest).not.toHaveBeenCalled();
  });
});
