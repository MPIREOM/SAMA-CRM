import { describe, expect, it } from "vitest";
import { decideRetry, shouldSkip, staleLockCutoff } from "../decisions";

const settings = { messaging: { email_enabled: true, whatsapp_enabled: true } };
const booking = { status: "confirmed", guest_email: "g@example.com", guest_phone: "+96899123456" };
const wa = { channel: "whatsapp", kind: "confirmation" };
const em = { channel: "email", kind: "confirmation" };

describe("shouldSkip", () => {
  it("sends when everything is in place", () => {
    expect(shouldSkip(booking, settings, wa)).toEqual({ skip: false });
    expect(shouldSkip(booking, settings, em)).toEqual({ skip: false });
  });

  it("skips cancelled / no-show bookings first", () => {
    expect(shouldSkip({ ...booking, status: "cancelled" }, settings, wa)).toEqual({ skip: true, reason: "booking_cancelled" });
    expect(shouldSkip({ ...booking, status: "no_show", guest_phone: "" }, settings, wa)).toEqual({
      skip: true,
      reason: "booking_no_show",
    });
  });

  it("skips when the channel switch is off", () => {
    expect(shouldSkip(booking, { messaging: { email_enabled: false, whatsapp_enabled: true } }, em)).toEqual({
      skip: true,
      reason: "email_disabled",
    });
    expect(shouldSkip(booking, { messaging: { email_enabled: true, whatsapp_enabled: false } }, wa)).toEqual({
      skip: true,
      reason: "whatsapp_disabled",
    });
  });

  it("skips when there is no address for the channel", () => {
    expect(shouldSkip({ ...booking, guest_email: null }, settings, em)).toEqual({ skip: true, reason: "no_email" });
    expect(shouldSkip({ ...booking, guest_email: "   " }, settings, em)).toEqual({ skip: true, reason: "no_email" });
    expect(shouldSkip({ ...booking, guest_phone: "" }, settings, wa)).toEqual({ skip: true, reason: "no_phone" });
  });

  it("skips a missing booking", () => {
    expect(shouldSkip(null, settings, wa)).toEqual({ skip: true, reason: "booking_not_found" });
  });
});

describe("decideRetry", () => {
  const now = new Date("2026-09-07T12:00:00Z");

  it("backs off +5m, +30m, +3h then fails", () => {
    expect(decideRetry(1, true, now)).toEqual({ status: "pending", send_at: new Date("2026-09-07T12:05:00Z") });
    expect(decideRetry(2, true, now)).toEqual({ status: "pending", send_at: new Date("2026-09-07T12:30:00Z") });
    expect(decideRetry(3, true, now)).toEqual({ status: "pending", send_at: new Date("2026-09-07T15:00:00Z") });
    expect(decideRetry(4, true, now)).toEqual({ status: "failed", send_at: null });
  });

  it("never retries a non-retryable error", () => {
    expect(decideRetry(1, false, now)).toEqual({ status: "failed", send_at: null });
  });
});

describe("staleLockCutoff", () => {
  it("is 10 minutes ago", () => {
    expect(staleLockCutoff(new Date("2026-09-07T12:00:00Z")).toISOString()).toBe("2026-09-07T11:50:00.000Z");
  });
});
