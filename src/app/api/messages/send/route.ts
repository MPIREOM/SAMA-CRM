import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { isWithin24h } from "@/lib/utils";

// Manual staff reply from the WhatsApp Inbox. Both roles may send.
// Inside the 24h customer-service window → free-form text.
// Outside it → the approved re-engagement template (WHATSAPP_REENGAGE_TEMPLATE)
// carrying the text as its single body parameter.

export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 4096;

export async function POST(req: Request) {
  try {
    // --- Auth: any signed-in staff member (both roles) ----------------------
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

    const contactId = typeof p.contactId === "string" ? p.contactId.trim() : "";
    if (!contactId) {
      return NextResponse.json({ error: "invalid_contact" }, { status: 400 });
    }

    const body = typeof p.body === "string" ? p.body.trim() : "";
    if (!body || body.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: "invalid_message" }, { status: 400 });
    }

    // --- Load contact through the user-scoped client (RLS applies) ----------
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .maybeSingle();
    if (contactErr) throw contactErr;
    if (!contact) {
      return NextResponse.json({ error: "contact_not_found" }, { status: 404 });
    }

    // --- Send: free-form inside the 24h window, template outside ------------
    let result: { ok: boolean; messageId: string | null; error: string | null };
    if (isWithin24h(contact.last_inbound_at)) {
      result = await sendWhatsAppText(contact.phone, body);
    } else {
      const templateName = process.env.WHATSAPP_REENGAGE_TEMPLATE;
      if (!templateName || templateName.startsWith("YOUR_")) {
        return NextResponse.json(
          { error: "outside_window_no_template" },
          { status: 422 }
        );
      }
      result = await sendWhatsAppTemplate(contact.phone, templateName, "ar", [
        body,
      ]);
    }

    // --- Log every attempt (admin client — inserts bypass RLS) --------------
    const admin = createAdminClient();
    const { data: message, error: logErr } = await admin
      .from("messages")
      .insert({
        contact_id: contact.id,
        direction: "outbound",
        channel: "whatsapp",
        status: result.ok ? "sent" : "failed",
        body,
        provider_msg_id: result.messageId,
        sent_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (logErr) {
      console.error("Failed to log outbound message:", logErr);
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "send_failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, message: message ?? null });
  } catch (err) {
    console.error("POST /api/messages/send failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
