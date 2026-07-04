import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromWaId } from "@/lib/phone";

// Meta WhatsApp Cloud API webhook.
// GET  = subscription verification handshake.
// POST = inbound messages + delivery status receipts. Must ACK 200 fast and
//        never throw — Meta retries + eventually disables slow/erroring hooks.

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Minimal payload shapes (Meta sends much more; we only read what we need).
// ---------------------------------------------------------------------------
interface WaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    type?: string;
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
}

interface WaStatus {
  id?: string;
  status?: string;
}

interface WaValue {
  messaging_product?: string;
  contacts?: { profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
}

interface WaPayload {
  entry?: { changes?: { value?: WaValue }[] }[];
}

// Keywords that revoke marketing consent (case-insensitive, trimmed).
const OPT_OUT_KEYWORDS = [
  "stop",
  "unsubscribe",
  "cancel",
  "إلغاء",
  "الغاء",
  "ايقاف",
  "إيقاف",
  "الغاء الاشتراك",
  "إلغاء الاشتراك",
  "توقف",
];

const RECEIPT_STATUSES = ["sent", "delivered", "read", "failed"];

// ---------------------------------------------------------------------------
// GET — Meta verification handshake.
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — inbound messages + status receipts.
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const raw = await req.text();

  // Optional signature verification (skipped when the secret is unset or a
  // placeholder, so local/dev setups keep working).
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret && !secret.startsWith("YOUR_")) {
    const header = req.headers.get("x-hub-signature-256") ?? "";
    const expected =
      "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  let payload: WaPayload | null = null;
  try {
    payload = JSON.parse(raw) as WaPayload;
  } catch {
    // Unparseable body — ACK anyway so Meta doesn't retry forever.
    return NextResponse.json({ received: true });
  }

  try {
    const admin = createAdminClient();

    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value || value.messaging_product !== "whatsapp") continue;

        // ---- a) Inbound messages (human replies only — never auto-respond).
        for (const msg of value.messages ?? []) {
          await handleInboundMessage(admin, value, msg);
        }

        // ---- b) Delivery receipts → patch message status in place.
        for (const s of value.statuses ?? []) {
          const status = s?.status;
          if (!s?.id || !status || !RECEIPT_STATUSES.includes(status)) continue;
          await admin
            .from("messages")
            .update({ status })
            .eq("provider_msg_id", s.id);
        }
      }
    }
  } catch (err) {
    // Never bubble errors back to Meta — log and ACK.
    console.error("WhatsApp webhook processing failed:", err);
  }

  return NextResponse.json({ received: true });
}

async function handleInboundMessage(
  admin: ReturnType<typeof createAdminClient>,
  value: WaValue,
  msg: WaMessage
): Promise<void> {
  const phone = fromWaId(msg.from ?? "");
  if (!phone) return;

  const now = new Date().toISOString();

  // Find-or-create the contact; an inbound message always refreshes the
  // 24h customer-service window (last_inbound_at).
  const { data: existing, error: findErr } = await admin
    .from("contacts")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (findErr) throw findErr;

  let contactId: string;
  if (existing) {
    contactId = existing.id;
    await admin
      .from("contacts")
      .update({ last_inbound_at: now })
      .eq("id", contactId);
  } else {
    const name = value.contacts?.[0]?.profile?.name || phone;
    const { data: inserted, error: insErr } = await admin
      .from("contacts")
      .insert({
        name,
        phone,
        lang: "ar",
        consent: false,
        last_inbound_at: now,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      throw insErr ?? new Error("contact_insert_failed");
    }
    contactId = inserted.id;
  }

  // Extract a text body for the supported message types.
  let body: string;
  switch (msg.type) {
    case "text":
      body = msg.text?.body ?? "[text]";
      break;
    case "button":
      body = msg.button?.text ?? "[button]";
      break;
    case "interactive":
      body =
        msg.interactive?.button_reply?.title ??
        msg.interactive?.list_reply?.title ??
        "[interactive]";
      break;
    default:
      body = `[${msg.type ?? "unknown"}]`;
  }

  const ts = Number(msg.timestamp);
  const sentAt =
    Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : now;

  await admin.from("messages").insert({
    contact_id: contactId,
    direction: "inbound",
    channel: "whatsapp",
    status: "received",
    body,
    provider_msg_id: msg.id ?? null,
    sent_at: sentAt,
  });

  // Opt-out keywords revoke marketing consent immediately.
  const t = body.trim().toLowerCase();
  if (OPT_OUT_KEYWORDS.includes(t)) {
    await admin
      .from("contacts")
      .update({
        consent: false,
        consent_at: now,
        consent_source: "whatsapp_stop",
      })
      .eq("id", contactId);
  }
}
