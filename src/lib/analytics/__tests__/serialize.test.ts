import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { safeText, toCsv, toXlsx } from "../serialize";

describe("report serialisation", () => {
  it("writes CSV with a BOM, quoting and formula neutralising", () => {
    const csv = toCsv({ name: "x", rows: [{ Guest: "Ali, Jr", Note: "=HYPERLINK(1)", Total: 12.5, Empty: null }] });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Guest,Note,Total,Empty\r\n"Ali, Jr",\'=HYPERLINK(1),12.5,');
    expect(safeText("-5")).toBe("'-5");
    expect(safeText(-5)).toBe(-5);
  });

  it("writes every sheet into one workbook", () => {
    const buf = toXlsx([
      { name: "Daily", rows: [{ Date: "2026-11-01", Sold: 3 }] },
      { name: "Empty", rows: [] },
    ]);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Daily", "Empty"]);
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Daily)).toEqual([{ Date: "2026-11-01", Sold: 3 }]);
  });
});
