import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { isIsoDate } from "@/lib/utils";

// Public kiosk submit — the kiosk device is unauthenticated, so this route
// performs its own validation and uses the service-role client. It NEVER
// echoes contact data back to the kiosk.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const payload: unknown = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid_body" },
        { status: 400 }
      );
    }
    const p = payload as Record<string, unknown>;

    // --- Required fields -----------------------------------------------------
    const name =
      typeof p.name === "string" ? p.name.trim().slice(0, 120) : "";
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "invalid_name" },
        { status: 400 }
      );
    }

    const phone = normalizePhone(typeof p.phone === "string" ? p.phone : null);
    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "invalid_phone" },
        { status: 400 }
      );
    }

    // --- Optional fields (sanitized; invalid values are dropped) -------------
    const rawEmail = typeof p.email === "string" ? p.email.trim() : "";
    const email =
      rawEmail && rawEmail.length <= 254 && EMAIL_RE.test(rawEmail)
        ? rawEmail
        : null;

    const rawBirthday = typeof p.birthday === "string" ? p.birthday.trim() : "";
    const birthday = rawBirthday && isIsoDate(rawBirthday) ? rawBirthday : null;

    const rawNationality =
      typeof p.nationality === "string" ? p.nationality.trim() : "";
    const nationality = rawNationality ? rawNationality.slice(0, 60) : null;

    const lang = p.lang === "ar" || p.lang === "en" ? p.lang : null;

    const consent = p.consent === true;
    const consentAt = new Date().toISOString();

    // --- Upsert contact by phone (service role — no session on the kiosk) ----
    const admin = createAdminClient();

    const { data: existing, error: findErr } = await admin
      .from("contacts")
      .select("id, consent, consent_source")
      .eq("phone", phone)
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing) {
      // Consent rules for RETURNING guests on this unauthenticated endpoint:
      //  - never revoke: an unticked box is not an explicit opt-out, and a
      //    forged request must not be able to silently unsubscribe a guest;
      //  - never override a WhatsApp STOP: that opt-out is authoritative and
      //    only staff may reverse it after speaking with the guest.
      const grantConsent =
        consent &&
        existing.consent !== true &&
        existing.consent_source !== "whatsapp_stop";

      const { error: updErr } = await admin
        .from("contacts")
        .update({
          name,
          ...(email ? { email } : {}),
          ...(birthday ? { birthday } : {}),
          ...(nationality ? { nationality } : {}),
          ...(lang ? { lang } : {}),
          ...(grantConsent
            ? {
                consent: true,
                consent_source: "checkin_kiosk",
                consent_at: consentAt,
              }
            : {}),
        })
        .eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await admin.from("contacts").insert({
        name,
        phone,
        email: email ?? null,
        birthday: birthday ?? null,
        nationality: nationality ?? null,
        lang: lang ?? "ar",
        consent,
        consent_source: "checkin_kiosk",
        consent_at: consentAt,
      });
      if (insErr) throw insErr;
    }

    // Never return contact data to the (public) kiosk.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
