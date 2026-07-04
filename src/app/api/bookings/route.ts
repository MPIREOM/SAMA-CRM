import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { bookingVars, renderTemplate } from "@/lib/templates";
import { sendToContact, type SendOutcome } from "@/lib/send-service";
import type { Contact } from "@/lib/database.types";

const SOURCES = ["Website", "OTA", "Offline"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    DATE_RE.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  );
}

export async function POST(req: Request) {
  try {
    // --- Auth: any signed-in staff member may create bookings ---------------
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // --- Validate ------------------------------------------------------------
    const payload: unknown = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const p = payload as Record<string, unknown>;

    const guest = typeof p.guest === "string" ? p.guest.trim() : "";
    if (!guest) {
      return NextResponse.json({ error: "invalid_guest" }, { status: 400 });
    }

    const phone = normalizePhone(typeof p.phone === "string" ? p.phone : null);
    if (!phone) {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
    }

    if (
      !isIsoDate(p.check_in) ||
      !isIsoDate(p.check_out) ||
      p.check_out <= p.check_in
    ) {
      return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
    }
    const check_in = p.check_in;
    const check_out = p.check_out;

    const source =
      typeof p.source === "string" &&
      (SOURCES as readonly string[]).includes(p.source)
        ? p.source
        : null;
    if (!source) {
      return NextResponse.json({ error: "invalid_source" }, { status: 400 });
    }

    const ref = typeof p.ref === "string" ? p.ref.trim() : "";
    if (!ref) {
      return NextResponse.json({ error: "invalid_ref" }, { status: 400 });
    }

    const room_type =
      typeof p.room_type === "string" && p.room_type.trim()
        ? p.room_type.trim()
        : null;

    const admin = createAdminClient();

    // --- a) Upsert contact by phone (consent fields untouched) ---------------
    const { data: existing, error: findErr } = await admin
      .from("contacts")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();
    if (findErr) throw findErr;

    let contact: Contact;
    if (existing) {
      const { data: updated, error: updErr } = await admin
        .from("contacts")
        .update({ name: guest, ...(room_type ? { room_type } : {}) })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (updErr || !updated) throw updErr ?? new Error("contact_update_failed");
      contact = updated;
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("contacts")
        .insert({ name: guest, phone, lang: "ar", room_type })
        .select("*")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("contact_insert_failed");
      contact = inserted;
    }

    // --- b) Insert booking ----------------------------------------------------
    const { data: booking, error: bookErr } = await admin
      .from("bookings")
      .insert({
        ref,
        contact_id: contact.id,
        guest,
        phone,
        check_in,
        check_out,
        room_type,
        source,
        status: "Confirmed",
      })
      .select("*")
      .single();
    if (bookErr) {
      if (bookErr.code === "23505") {
        return NextResponse.json({ error: "ref_exists" }, { status: 409 });
      }
      throw bookErr;
    }
    if (!booking) throw new Error("booking_insert_failed");

    // --- c) Fire the booking-confirmation automation (if enabled) -------------
    let confirmation: SendOutcome | null = null;
    const { data: automation, error: autoErr } = await admin
      .from("automations")
      .select("*")
      .eq("trigger_kind", "booking_created")
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();
    if (autoErr) throw autoErr;

    if (automation) {
      const body = renderTemplate(automation.template ?? "", bookingVars(booking));
      // sendToContact enforces consent/market rules and logs to `messages`.
      confirmation = await sendToContact({
        contact,
        channel: automation.channel === "email" ? "email" : "whatsapp",
        msgType:
          (automation.msg_type as "utility" | "marketing" | null) ?? "utility",
        body,
        automationId: automation.id,
        bookingId: booking.id,
      });
    }

    return NextResponse.json({ booking, confirmation }, { status: 201 });
  } catch (err) {
    console.error("POST /api/bookings failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
