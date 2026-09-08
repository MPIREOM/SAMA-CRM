import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/bk/audit";
import { formatOmr } from "@/lib/booking-engine/pricing";
import { logger } from "@/lib/logger";
import { addonsSummary } from "@/components/admin/shared";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = [
  "ref",
  "status",
  "source",
  "guest_name",
  "guest_phone",
  "guest_email",
  "nationality",
  "preferred_lang",
  "room_type",
  "room",
  "check_in",
  "check_out",
  "nights",
  "adults",
  "children",
  "addons",
  "room_subtotal_omr",
  "discount_omr",
  "addons_omr",
  "service_charge_omr",
  "tourism_fee_omr",
  "vat_omr",
  "total_omr",
  "promo_code",
  "special_requests",
  "internal_notes",
  "created_at",
  "cancelled_at",
  "cancel_reason",
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** GET /reservations/export?from=YYYY-MM-DD&to=YYYY-MM-DD — super_admin only. */
export async function GET(request: NextRequest) {
  const access = await requireSuperAdmin();
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? "unauthorized" : "forbidden" }, { status: access.status });

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if ((from && !ISO.test(from)) || (to && !ISO.test(to))) {
    return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    let query = admin
      .from("bk_bookings")
      .select("*, room_type:bk_room_types(name_en), room:bk_rooms(room_number), addons:bk_booking_addons(quantity, status, addon:bk_addons(name_en))")
      .order("check_in")
      .limit(5000);
    if (from) query = query.gte("check_in", from);
    if (to) query = query.lte("check_in", to);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const lines = [COLUMNS.join(",")];
    for (const b of data ?? []) {
      const roomType = Array.isArray(b.room_type) ? b.room_type[0] : b.room_type;
      const room = Array.isArray(b.room) ? b.room[0] : b.room;
      const addonLines = (b.addons ?? []).map((l) => ({ ...l, addon: Array.isArray(l.addon) ? (l.addon[0] ?? null) : l.addon }));
      const row: Record<(typeof COLUMNS)[number], unknown> = {
        ref: b.ref,
        status: b.status,
        source: b.source,
        guest_name: b.guest_name,
        guest_phone: b.guest_phone,
        guest_email: b.guest_email,
        nationality: b.nationality,
        preferred_lang: b.preferred_lang,
        room_type: roomType?.name_en ?? "",
        room: room?.room_number ?? "",
        check_in: b.check_in,
        check_out: b.check_out,
        nights: b.nights,
        adults: b.adults,
        children: b.children,
        addons: addonsSummary(addonLines),
        room_subtotal_omr: formatOmr(Number(b.room_subtotal_omr)),
        discount_omr: formatOmr(Number(b.discount_omr)),
        addons_omr: formatOmr(Number(b.addons_omr)),
        service_charge_omr: formatOmr(Number(b.service_charge_omr)),
        tourism_fee_omr: formatOmr(Number(b.tourism_fee_omr)),
        vat_omr: formatOmr(Number(b.vat_omr)),
        total_omr: formatOmr(Number(b.total_omr)),
        promo_code: b.promo_code,
        special_requests: b.special_requests,
        internal_notes: b.internal_notes,
        created_at: b.created_at,
        cancelled_at: b.cancelled_at,
        cancel_reason: b.cancel_reason,
      };
      lines.push(COLUMNS.map((c) => csvCell(row[c])).join(","));
    }

    await audit({ userId: access.userId, email: null }, "booking.export", "bk_bookings", null, {
      from: from ?? null,
      to: to ?? null,
      rows: (data ?? []).length,
    });

    const name = `sama-reservations${from ? `-${from}` : ""}${to ? `-${to}` : ""}.csv`;
    // UTF-8 BOM so Excel opens Arabic names correctly.
    return new NextResponse("\uFEFF" + lines.join("\r\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logger.error("reservations.export", (e as Error).message);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
