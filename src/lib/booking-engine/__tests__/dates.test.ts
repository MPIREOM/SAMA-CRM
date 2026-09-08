import { describe, expect, it } from "vitest";
import {
  computeSendAt,
  formatLongDate,
  hoursUntilCheckIn,
  muscatDateTime,
  muscatToday,
  nextRetryAt,
} from "../dates";

describe("Muscat time helpers", () => {
  it("converts hotel-local date + time to the right UTC instant (UTC+4)", () => {
    expect(muscatDateTime("2026-09-14", "10:00").toISOString()).toBe("2026-09-14T06:00:00.000Z");
    expect(muscatDateTime("2026-01-01", "02:00").toISOString()).toBe("2025-12-31T22:00:00.000Z");
  });

  it("muscatToday rolls over at 20:00 UTC", () => {
    expect(muscatToday(new Date("2026-09-07T19:59:00Z"))).toBe("2026-09-07");
    expect(muscatToday(new Date("2026-09-07T20:00:00Z"))).toBe("2026-09-08");
  });
});

describe("scheduled send times (mirror of bk_send_at)", () => {
  const now = new Date("2026-09-07T12:00:00Z");

  it("pre-arrival = 3 days before check-in at 10:00 Muscat", () => {
    const at = computeSendAt("pre_arrival", "2026-09-17", "2026-09-19", undefined, now);
    expect(at.toISOString()).toBe("2026-09-14T06:00:00.000Z");
  });

  it("post-stay = 1 day after check-out at 11:00 Muscat", () => {
    const at = computeSendAt("post_stay", "2026-09-17", "2026-09-19", undefined, now);
    expect(at.toISOString()).toBe("2026-09-20T07:00:00.000Z");
  });

  it("pre-arrival for a last-minute booking goes out 3 minutes after confirmation", () => {
    const at = computeSendAt("pre_arrival", "2026-09-08", "2026-09-09", undefined, now);
    expect(at.toISOString()).toBe("2026-09-07T12:03:00.000Z");
  });

  it("confirmation is immediate", () => {
    expect(computeSendAt("confirmation", "2026-09-17", "2026-09-19", undefined, now)).toBe(now);
  });

  it("respects custom schedule settings", () => {
    const at = computeSendAt(
      "post_stay",
      "2026-09-17",
      "2026-09-19",
      { pre_arrival_days_before: 2, pre_arrival_time: "09:30", post_stay_days_after: 2, post_stay_time: "18:15" },
      now
    );
    expect(at.toISOString()).toBe("2026-09-21T14:15:00.000Z");
  });
});

describe("dispatcher backoff", () => {
  const now = new Date("2026-09-07T12:00:00Z");
  it("retries at +5m, +30m, +3h then gives up", () => {
    expect(nextRetryAt(0, now)?.toISOString()).toBe("2026-09-07T12:05:00.000Z");
    expect(nextRetryAt(1, now)?.toISOString()).toBe("2026-09-07T12:30:00.000Z");
    expect(nextRetryAt(2, now)?.toISOString()).toBe("2026-09-07T15:00:00.000Z");
    expect(nextRetryAt(3, now)).toBeNull();
  });
});

describe("cancellation deadline", () => {
  it("computes hours until 14:00 Muscat on the check-in date", () => {
    const now = new Date("2026-09-15T10:00:00Z"); // 14:00 Muscat, two days before
    expect(hoursUntilCheckIn("2026-09-17", "14:00", now)).toBe(48);
  });
});

describe("guest-facing date formatting", () => {
  it("uses Latin digits in both languages", () => {
    expect(formatLongDate("2026-09-17", "en")).toMatch(/Thu.*17 Sept? 2026/);
    expect(formatLongDate("2026-09-17", "ar")).toMatch(/17/);
    expect(formatLongDate("2026-09-17", "ar")).not.toMatch(/[٠-٩]/);
  });
});
