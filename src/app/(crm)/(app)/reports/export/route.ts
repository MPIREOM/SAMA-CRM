import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/bk/audit";
import { logger } from "@/lib/logger";
import { muscatToday } from "@/lib/booking-engine/dates";
import { buildReport, REPORT_TYPES, type ReportParams, type ReportType } from "@/lib/analytics/reports";
import { toCsv, toXlsx } from "@/lib/analytics/serialize";
import { addDaysIso, daysBetween } from "@/lib/analytics/stats";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /reports/export?type=reservations|revenue|addons|guests|daily&from&to&format=csv|xlsx[&sheet]
 * Front-desk lists (type=daily) are open to both staff roles; every other
 * report is super_admin only. Every download is written to the audit log.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const type = q.get("type") as ReportType;
  if (!REPORT_TYPES.includes(type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 });

  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const allowed = type === "daily" ? ["super_admin", "reservation_desk"] : ["super_admin"];
  if (!session.role || !allowed.includes(session.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const today = muscatToday();
  let from = q.get("from") ?? today;
  let to = q.get("to") ?? from;
  if (!ISO.test(from) || !ISO.test(to)) return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
  if (to < from) [from, to] = [to, from];
  if (daysBetween(from, to) > 731) from = addDaysIso(to, -731);

  const params: ReportParams = {
    from,
    to,
    basis: (["check_in", "created", "stay"] as const).find((b) => b === q.get("basis")) ?? "check_in",
    status: (["all", "live", "cancelled"] as const).find((s) => s === q.get("status")) ?? "all",
    source: ["website", "staff", "phone", "walk_in", "ota"].includes(q.get("source") ?? "") ? q.get("source")! : undefined,
    roomType: UUID.test(q.get("room_type") ?? "") ? q.get("room_type")! : undefined,
  };
  const format = q.get("format") === "xlsx" ? "xlsx" : "csv";

  try {
    const admin = createAdminClient();
    const report = await buildReport(admin, type, params);
    const rows = report.sheets.reduce((n, s) => n + s.rows.length, 0);
    await audit({ userId: session.userId, email: session.email }, "report.export", "reports", type, { ...params, format, rows });

    if (format === "xlsx") {
      return new NextResponse(new Uint8Array(toXlsx(report.sheets)), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${report.file}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }
    // CSV holds one table: the requested sheet, or the first.
    const sheet = report.sheets.find((s) => s.name === q.get("sheet")) ?? report.sheets[0];
    const suffix = report.sheets.length > 1 ? `-${sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
    return new NextResponse(toCsv(sheet), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${report.file}${suffix}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logger.error("reports.export", (e as Error).message);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
