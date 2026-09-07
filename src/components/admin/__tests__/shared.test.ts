import { describe, expect, it } from "vitest";
import { errorText, fmtDate, fmtDateTime, fmtMoney, statusVariant, STATUS_BAR_CLASS } from "../shared";

describe("fmtDateTime", () => {
  it("renders instants in Muscat time (UTC+4)", () => {
    // 2026-09-07T22:30Z is 02:30 on the 8th in Muscat.
    expect(fmtDateTime("2026-09-07T22:30:00Z", "en")).toBe("8 Sept 2026, 02:30");
  });

  it("falls back for empty / invalid values", () => {
    expect(fmtDateTime(null)).toBe("—");
    expect(fmtDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("fmtDate", () => {
  it("renders hotel dates without timezone drift", () => {
    expect(fmtDate("2026-09-07", "en")).toBe("7 Sept 2026");
    expect(fmtDate("2026-01-01T00:00:00+04:00", "en")).toBe("1 Jan 2026");
  });
});

describe("fmtMoney", () => {
  it("formats OMR with 3 decimals", () => {
    expect(fmtMoney(165.11, "en")).toBe("OMR 165.110");
    expect(fmtMoney("12.5", "ar")).toBe("12.500 ر.ع");
    expect(fmtMoney(null, "en")).toBe("OMR 0.000");
  });
});

describe("errorText", () => {
  it("maps RPC / guard codes to readable messages and passes others through", () => {
    expect(errorText("sold_out", "en")).toMatch(/No rooms/);
    expect(errorText('P0001: sold_out', "ar")).toMatch(/لا توجد غرف/);
    expect(errorText("forbidden", "en")).toMatch(/permission/);
    expect(errorText("Something custom", "en")).toBe("Something custom");
    expect(errorText(null, "en")).toBe("Something went wrong");
  });
});

describe("status styling", () => {
  it("never draws cancelled or no-show bars", () => {
    expect(STATUS_BAR_CLASS.cancelled).toBe("hidden");
    expect(STATUS_BAR_CLASS.no_show).toBe("hidden");
    expect(statusVariant("checked_in")).toBe("green");
    expect(statusVariant("pending")).toBe("gold");
  });
});
