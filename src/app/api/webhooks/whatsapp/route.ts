import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromWaId } from "@/lib/phone";
import { logger } from "@/lib/logger";
import { whatsappEnv } from "@/lib/whatsapp-env";
import { forwardWebhook, signWebhookBody, splitWebhookPayload, type SplitResult } from "@/lib/whatsapp-forward";

// Meta WhatsApp Cloud API webhook.
// GET  = subscription verification handshake.
// POST = inbound messages + delivery status receipts. Must ACK 200 fast and
//        never throw — Meta retries + eventually disables slow/erroring hooks.

export const dynamic = "force-dynamic";
// Relaying to the other app sharing this number can take a few seconds; keep
// headroom above the forward timeout so Meta always gets our ACK.
export const maxDuration = 30;

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

interface WaStatusError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

interface WaStatus {
  id?: string;
  status?: string;
  errors?: WaStatusError[];
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

// Keywords that revoke marketing consent. Matching is tolerant: the inbound
// text is lowercased, stripped of punctuation/quotes and Arabic hamza
// variants normalized, then short messages (≤ 5 words) match if they CONTAIN
// a keyword as a standalone word — so "Stop.", "\"إلغاء\"" and
// "الغاء الرسائل" all opt out, per the instructions in our own templates.
const OPT_OUT_KEYWORDS = [
  "stop",
  "unsubscribe",
  "cancel",
  "الغاء",
  "ايقاف",
  "توقف",
];

function isOptOut(body: string): boolean {
  const normalized = body
    .toLowerCase()
    .replace(/[أإآ]/g, "ا") // unify alef/hamza forms (إلغاء -> الغاء)
    .replace(/[.,!?؟،؛;:'"«»()\[\]_\-*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  const words = normalized.split(" ");
  if (words.length > 5) return false; // only short, deliberate messages
  return OPT_OUT_KEYWORDS.some((k) => words.includes(k));
}

const RECEIPT_STATUSES = ["sent", "delivered", "read", "failed"];

// ---------------------------------------------------------------------------
// GET — Meta verification handshake.
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // WHATSAPP_VERIFY_TOKEN, or WHATSAPP_WEBHOOK_VERIFY_TOKEN when the variables
  // are shared with the SAAS project (see src/lib/whatsapp-env.ts).
  const expected = whatsappEnv().verifyToken;
  if (mode === "subscribe" && expected && token === expected) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — inbound messages + status receipts.
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const raw = await req.text();

  // Signature verification is MANDATORY: this public endpoint mutates consent
  // and the 24h window with the service role, so it fails closed when
  // WHATSAPP_APP_SECRET is missing rather than accepting forged payloads.
  const env = whatsappEnv();
  const secret = env.appSecret;
  if (!secret) {
    return NextResponse.json(
      { error: "webhook_not_configured (WHATSAPP_APP_SECRET)" },
      { status: 503 }
    );
  }
  const header = req.headers.get("x-hub-signature-256") ?? "";
  const expected =
    "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: WaPayload | null = null;
  try {
    payload = JSON.parse(raw) as WaPayload;
  } catch {
    // Unparseable body — ACK anyway so Meta doesn't retry forever.
    return NextResponse.json({ received: true });
  }

  // The number is shared with another app (SAAS): Meta delivers everything
  // here, so hand that app its admins' messages and every receipt, and keep
  // guest conversations out of its bot (see src/lib/whatsapp-forward.ts).
  const received: WaPayload = payload ?? {};
  const split: SplitResult<WaPayload> = env.forwardUrl
    ? splitWebhookPayload(received, new Set(env.forwardSenders))
    : { local: received, forward: null, forwardedMessages: 0, forwardedStatuses: 0 };

  try {
    const admin = createAdminClient();

    for (const entry of split.local.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value || value.messaging_product !== "whatsapp") continue;

        // ---- a) Inbound messages (human replies only — never auto-respond).
        for (const msg of value.messages ?? []) {
          await handleInboundMessage(admin, value, msg);
        }

        // ---- b) Delivery receipts → patch message statuses, grouped so a
        // receipt batch costs at most one UPDATE per status value.
        const byStatus = new Map<string, string[]>();
        for (const s of value.statuses ?? []) {
          const status = s?.status;
          if (!s?.id || !status || !RECEIPT_STATUSES.includes(status)) continue;
          const ids = byStatus.get(status) ?? [];
          ids.push(s.id);
          byStatus.set(status, ids);
        }
        for (const [status, ids] of Array.from(byStatus.entries())) {
          await admin
            .from("messages")
            .update({ status })
            .in("provider_msg_id", ids);
        }

        // ---- c) Booking-engine message log (bk_message_log) — same receipts,
        // keyed by provider_message_id. Failed receipts keep Meta's error title.
        await updateBookingMessageLog(admin, value.statuses ?? []);
      }
    }
  } catch (err) {
    // Never bubble errors back to Meta — log and ACK.
    console.error("WhatsApp webhook processing failed:", err);
  }

  if (env.forwardUrl && split.forward) {
    const body = JSON.stringify(split.forward);
    const outcome = await forwardWebhook({
      url: env.forwardUrl,
      body,
      signature: signWebhookBody(body, secret),
      timeoutMs: 8000,
    });
    const meta = {
      messages: split.forwardedMessages,
      statuses: split.forwardedStatuses,
      status: outcome.status,
      ms: outcome.ms,
    };
    if (outcome.ok) logger.info("whatsapp.forward", "relayed to partner app", meta);
    else logger.warn("whatsapp.forward", "relay not acknowledged", { ...meta, error: outcome.error });
  }

  return NextResponse.json({ received: true });
}

// Receipt statuses only ever move a log row forward (sent → delivered → read);
// a late "sent" receipt must not downgrade a row already marked "delivered".
const LOG_RECEIPT_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

async function updateBookingMessageLog(
  admin: ReturnType<typeof createAdminClient>,
  statuses: WaStatus[]
): Promise<void> {
  const failed: { id: string; error: string }[] = [];
  const byStatus = new Map<string, string[]>();
  for (const s of statuses) {
    const status = s?.status;
    if (!s?.id || !status || !RECEIPT_STATUSES.includes(status)) continue;
    if (status === "failed") {
      const e = s.errors?.[0];
      const error =
        [e?.title, e?.message, e?.error_data?.details]
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .join(" — ") || "Delivery failed";
      failed.push({ id: s.id, error: e?.code ? `(#${e.code}) ${error}` : error });
      continue;
    }
    const ids = byStatus.get(status) ?? [];
    ids.push(s.id);
    byStatus.set(status, ids);
  }

  for (const [status, ids] of Array.from(byStatus.entries())) {
    const rank = LOG_RECEIPT_RANK[status] ?? 0;
    const lower = Object.keys(LOG_RECEIPT_RANK).filter((k) => LOG_RECEIPT_RANK[k] < rank);
    if (lower.length === 0) continue; // "sent" is what the dispatcher already wrote
    await admin
      .from("bk_message_log")
      .update({ status })
      .in("provider_message_id", ids)
      .in("status", lower);
  }
  for (const f of failed) {
    await admin
      .from("bk_message_log")
      .update({ status: "failed", error: f.error })
      .eq("provider_message_id", f.id);
  }
}

async function handleInboundMessage(
  admin: ReturnType<typeof createAdminClient>,
  value: WaValue,
  msg: WaMessage
): Promise<void> {
  const phone = fromWaId(msg.from ?? "");
  if (!phone) return;

  // Meta retries deliveries — the same message id must never be stored twice.
  if (msg.id) {
    const { data: dup } = await admin
      .from("messages")
      .select("id")
      .eq("provider_msg_id", msg.id)
      .limit(1)
      .maybeSingle();
    if (dup) return;
  }

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
    if (insErr?.code === "23505") {
      // Lost a concurrent-create race (phone is unique) — reuse the winner.
      const { data: winner } = await admin
        .from("contacts")
        .select("id")
        .eq("phone", phone)
        .single();
      if (!winner) throw insErr;
      contactId = winner.id;
      await admin
        .from("contacts")
        .update({ last_inbound_at: now })
        .eq("id", contactId);
    } else if (insErr || !inserted) {
      throw insErr ?? new Error("contact_insert_failed");
    } else {
      contactId = inserted.id;
    }
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
  if (isOptOut(body)) {
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
