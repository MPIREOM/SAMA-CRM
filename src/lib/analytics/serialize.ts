import * as XLSX from "xlsx";

// Report → CSV / Excel. Shared by /reports/export; no server-only imports so
// it is unit-testable.

export type Cell = string | number | null;
export type Sheet = { name: string; rows: Record<string, Cell>[] };

/** Neutralise spreadsheet formula injection in text cells (=, +, -, @, tab, CR). */
export function safeText(v: Cell): Cell {
  if (typeof v !== "string") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(safeText(v));
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function headersOf(sheet: Sheet): string[] {
  const seen = new Set<string>();
  for (const r of sheet.rows) for (const k of Object.keys(r)) seen.add(k);
  return Array.from(seen);
}

/** One sheet as CSV with a UTF-8 BOM so Excel shows Arabic correctly. */
export function toCsv(sheet: Sheet): string {
  const headers = headersOf(sheet);
  const lines = [headers.map((h) => csvCell(h)).join(",")];
  for (const r of sheet.rows) lines.push(headers.map((h) => csvCell(r[h] ?? null)).join(","));
  return "﻿" + lines.join("\r\n");
}

/** Every sheet in one .xlsx workbook (column widths sized to content). */
export function toXlsx(sheets: Sheet[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const headers = headersOf(sheet);
    const rows = sheet.rows.map((r) => Object.fromEntries(headers.map((h) => [h, safeText(r[h] ?? null)])));
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows, { header: headers }) : XLSX.utils.aoa_to_sheet([headers.length ? headers : ["No rows for this period"]]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.min(48, Math.max(h.length, ...rows.slice(0, 200).map((r) => String(r[h] ?? "").length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
