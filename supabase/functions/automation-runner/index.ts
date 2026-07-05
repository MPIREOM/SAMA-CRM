// ============================================================================
// SAMA CRM — automation-runner (Supabase Edge Function, Deno runtime)
//
// Runs on a DAILY cron (pg_cron + pg_net, 05:00 UTC = 09:00 Asia/Muscat — see
// supabase/migrations/0002_schedule_automation_runner.sql) and executes the
// time-based automations plus a 48h catch-up for missed booking confirmations:
//
//   booking_created  → catch-up for Confirmed bookings created in the last 48h
//   pre_arrival      → check_in between today+1 and today+offset_days
//                      (default 2) — a window, so a missed daily run cannot
//                      skip a cohort (offset 0 keeps the exact-today match)
//   post_stay        → check_out between today-(offset_days+2) and
//                      today-offset_days (default 1; 3-day look-back); also
//                      stamps contact.last_stay / room_type (powers win_back)
//   birthday         → contact birthday month-day == today (once per year)
//   win_back         → contact last_stay between today-(offset_days+3) and
//                      today-offset_days (default 335; 4-day look-back)
//
// IDEMPOTENT: the `messages` table is the dedupe ledger — every attempt
// (sent or failed) inserts a row keyed by automation_id + booking_id or
// automation_id + contact_id, but only SUCCESSFUL sends (status='sent') are
// treated as "already done" by the dedupe checks, so failed attempts are
// retried on later runs within each trigger's date window.
//
// This file is self-contained (the Edge runtime cannot import from src/), but
// the send pipeline mirrors the app's @/lib/send-service compliance gates,
// @/lib/templates rendering and @/lib/whatsapp / @/lib/email providers.
// ============================================================================

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// ----------------------------------------------------------------------------
// Environment — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected by
// the Edge runtime; the rest are set via `supabase secrets set`. Missing or
// placeholder ("YOUR_*") values degrade gracefully: provider calls report a
// clear error which is logged to `messages` as status='failed'.
// ----------------------------------------------------------------------------
const ENV = {
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  waToken: Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "",
  waPhoneId: Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "",
  waReengageTemplate: Deno.env.get("WHATSAPP_REENGAGE_TEMPLATE") ?? "",
  resendApiKey: Deno.env.get("RESEND_API_KEY") ?? "",
  emailFrom: Deno.env.get("EMAIL_FROM") ?? "Sama Hotel <noreply@example.com>",
  termsLink: Deno.env.get("TERMS_LINK") ?? "",
};

/** A value is usable when present and free of YOUR_* placeholders (anywhere
 * in the string — e.g. `https://YOUR_DOMAIN/terms`, `noreply@YOUR_DOMAIN`). */
function configured(value: string): boolean {
  return value.length > 0 && !value.includes("YOUR_");
}

const GRAPH_VERSION = "v20.0";
const BATCH_CAP = 200; // max sends per automation per run
const CONCURRENCY = 5; // parallel deliveries per chunk (same as the app's campaign route)
const CONTACT_COLS =
  "id, name, phone, email, market, consent, last_inbound_at, last_stay, room_type, birthday";
const BOOKING_COLS =
  "id, ref, guest, phone, contact_id, check_in, check_out, room_type, status, created_at";

// ----------------------------------------------------------------------------
// Row shapes (subset of the app's database.types.ts — strict-null faithful)
// ----------------------------------------------------------------------------
interface AutomationRow {
  id: string;
  name: string | null;
  trigger_kind: string | null;
  channel: string | null;
  msg_type: string | null;
  market: string | null;
  offset_days: number | null;
  template: string | null;
  enabled: boolean | null;
}

interface BookingRow {
  id: string;
  ref: string;
  guest: string | null;
  phone: string | null;
  contact_id: string | null;
  check_in: string | null;
  check_out: string | null;
  room_type: string | null;
  status: string | null;
  created_at: string | null;
}

interface ContactRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  market: string | null;
  consent: boolean | null;
  last_inbound_at: string | null;
  last_stay: string | null;
  room_type: string | null;
  birthday: string | null;
}

// ----------------------------------------------------------------------------
// Date helpers — all "today" math in Asia/Muscat (UTC+4, no DST)
// ----------------------------------------------------------------------------
function muscatTodayStr(): string {
  return new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
}

/** addDays('2026-07-04', 2) -> '2026-07-06' (pure date math, UTC-safe). */
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** True while the contact's 24-hour WhatsApp customer-service window is open. */
function isWithin24h(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  return Number.isFinite(t) && Date.now() - t < 24 * 3600e3;
}

// ----------------------------------------------------------------------------
// Template rendering — mirrors @/lib/templates
// ----------------------------------------------------------------------------
type TemplateVars = Record<string, string | null | undefined>;

/** Replace {{vars}}; unknown/empty vars are left intact so they stay visible. */
function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null || value === ""
      ? match
      : String(value);
  });
}

// The app ships a public terms page, so {{terms_link}} always renders even
// when the TERMS_LINK secret is not set.
const DEFAULT_TERMS_LINK = "https://sama-crm.vercel.app/terms";

function termsLink(): string {
  return configured(ENV.termsLink) ? ENV.termsLink : DEFAULT_TERMS_LINK;
}

// ----------------------------------------------------------------------------
// Compliance — identical to the app (@/lib/phone + @/lib/send-service)
// ----------------------------------------------------------------------------
/** HARD RULE: WhatsApp *marketing* only ever goes to Oman + GCC numbers. */
function canReceiveWhatsAppMarketing(market: string | null): boolean {
  return market === "Oman" || market === "GCC";
}

/** automation.market → allowed contact markets (null = no market gate). */
function targetMarkets(automationMarket: string | null): string[] | null {
  if (!automationMarket || automationMarket === "All") return null;
  if (automationMarket === "Oman+GCC") return ["Oman", "GCC"];
  return [automationMarket]; // 'Oman' | 'GCC'
}

// ----------------------------------------------------------------------------
// WhatsApp Cloud API — mirrors @/lib/whatsapp
// ----------------------------------------------------------------------------
interface ProviderResult {
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

function toWaId(phone: string): string {
  return phone.replace(/^\+/, "");
}

async function waPost(payload: Record<string, unknown>): Promise<ProviderResult> {
  if (!configured(ENV.waToken) || !configured(ENV.waPhoneId)) {
    return {
      ok: false,
      messageId: null,
      error:
        "WhatsApp Cloud API is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)",
    };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${ENV.waPhoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.waToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        messageId: null,
        error: data?.error?.message ?? `WhatsApp API error (HTTP ${res.status})`,
      };
    }
    return { ok: true, messageId: data?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    return { ok: false, messageId: null, error: (e as Error).message };
  }
}

/** Free-form text — only valid INSIDE the 24h customer-service window. */
function sendWhatsAppText(phone: string, body: string): Promise<ProviderResult> {
  return waPost({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWaId(phone),
    type: "text",
    text: { preview_url: true, body },
  });
}

/** Pre-approved template — required OUTSIDE the 24h window. One body {{1}}. */
function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  body: string
): Promise<ProviderResult> {
  // Meta's Cloud API rejects template body parameters containing newlines,
  // tabs, or 4+ consecutive spaces — collapse all whitespace to single spaces.
  // (Free-form sendWhatsAppText is NOT sanitized: newlines are fine there.)
  const paramText = body.replace(/\s+/g, " ").trim();
  return waPost({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWaId(phone),
    type: "template",
    template: {
      name: templateName,
      language: { code: "ar" },
      components: [
        { type: "body", parameters: [{ type: "text", text: paramText }] },
      ],
    },
  });
}

// ----------------------------------------------------------------------------
// Resend email — mirrors @/lib/email (RTL-aware bilingual wrapper)
// ----------------------------------------------------------------------------
/** Split a bilingual template (Arabic ⸻ divider ⸻ English) into halves.
 * The divider is a line consisting solely of one or more dash characters —
 * the composer UI tells authors to use a single ⸻ on its own line. */
function splitBilingual(template: string): { ar: string; en: string } {
  const parts = template.split(/\n\s*[⸻—–-]+\s*\n/);
  if (parts.length >= 2) {
    return { ar: parts[0].trim(), en: parts.slice(1).join("\n").trim() };
  }
  return { ar: template.trim(), en: template.trim() };
}

function bilingualEmailHtml(arabicBody: string, englishBody: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf5f5;">
    <div style="max-width:600px;margin:0 auto;padding:24px;font-family:'Tajawal','Nunito Sans',Tahoma,Arial,sans-serif;">
      <div style="background:#3b171b;border-radius:12px 12px 0 0;padding:20px;text-align:center;">
        <span style="color:#c5a04f;font-size:22px;font-weight:bold;letter-spacing:1px;">SAMA HOTEL &nbsp;|&nbsp; فندق سما</span>
      </div>
      <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px;color:#2e1215;font-size:15px;line-height:1.8;">
        <div dir="rtl" style="text-align:right;">${esc(arabicBody)}</div>
        <hr style="border:none;border-top:1px solid #e3cbce;margin:24px 0;"/>
        <div dir="ltr" style="text-align:left;">${esc(englishBody)}</div>
      </div>
      <p style="text-align:center;color:#a96e75;font-size:12px;margin-top:16px;">
        Sama Hotel · Muscat, Oman
      </p>
    </div>
  </body>
</html>`;
}

async function sendResendEmail(
  to: string,
  subject: string,
  bilingualBody: string
): Promise<ProviderResult> {
  if (!configured(ENV.resendApiKey)) {
    return {
      ok: false,
      messageId: null,
      error: "Resend is not configured (RESEND_API_KEY)",
    };
  }
  if (!configured(ENV.emailFrom)) {
    return { ok: false, messageId: null, error: "EMAIL_FROM is not configured" };
  }
  const { ar, en } = splitBilingual(bilingualBody);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ENV.emailFrom,
        to,
        subject,
        html: bilingualEmailHtml(ar, en),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        messageId: null,
        error: data?.message ?? `Resend API error (HTTP ${res.status})`,
      };
    }
    return { ok: true, messageId: data?.id ?? null, error: null };
  } catch (e) {
    return { ok: false, messageId: null, error: (e as Error).message };
  }
}

// ----------------------------------------------------------------------------
// Send pipeline — compliance gates + provider dispatch + `messages` ledger
// ----------------------------------------------------------------------------
interface Outcome {
  status: "sent" | "skipped" | "failed";
  reason: string | null;
}

async function logMessage(
  db: SupabaseClient,
  args: {
    automationId: string;
    contactId: string;
    bookingId: string | null;
    channel: "whatsapp" | "email";
    ok: boolean;
    body: string;
    error: string | null;
    providerMsgId: string | null;
  }
): Promise<void> {
  const { error } = await db.from("messages").insert({
    contact_id: args.contactId,
    booking_id: args.bookingId,
    automation_id: args.automationId,
    direction: "outbound",
    channel: args.channel,
    status: args.ok ? "sent" : "failed",
    body: args.ok ? args.body : `${args.body}\n\n[error: ${args.error ?? "unknown"}]`,
    provider_msg_id: args.providerMsgId,
    sent_at: new Date().toISOString(),
  });
  if (error) {
    console.error(`messages insert failed (contact ${args.contactId}): ${error.message}`);
  }
}

/**
 * Deliver one automation message to one contact. EVERY real attempt (sent or
 * failed) is written to `messages` — that row is the idempotency ledger.
 * Compliance skips return before any provider call and are NOT logged, so a
 * contact who later grants consent can still be picked up by a future match.
 */
async function deliver(
  db: SupabaseClient,
  automation: AutomationRow,
  contact: ContactRow,
  body: string,
  bookingId: string | null
): Promise<Outcome> {
  const channel =
    automation.channel === "email"
      ? ("email" as const)
      : automation.channel === "whatsapp"
        ? ("whatsapp" as const)
        : null;
  if (!channel) return { status: "skipped", reason: "invalid_channel" };

  const msgType = automation.msg_type === "marketing" ? "marketing" : "utility";

  // Audience gate from the automation's own market targeting.
  const targeted = targetMarkets(automation.market);
  if (targeted && !targeted.includes(contact.market ?? "")) {
    return { status: "skipped", reason: "market_not_targeted" };
  }

  // Compliance gates — identical to the app's send-service.
  if (msgType === "marketing") {
    if (contact.consent !== true) {
      return { status: "skipped", reason: "no_consent" };
    }
    // HARD RULE: WhatsApp marketing never goes to International numbers.
    if (channel === "whatsapp" && !canReceiveWhatsAppMarketing(contact.market)) {
      return { status: "skipped", reason: "market_not_allowed" };
    }
  }

  let ok = false;
  let providerMsgId: string | null = null;
  let error: string | null = null;

  if (channel === "whatsapp") {
    if (!contact.phone) return { status: "skipped", reason: "no_phone" };
    if (isWithin24h(contact.last_inbound_at)) {
      // Inside the 24h window → free-form text is allowed.
      const res = await sendWhatsAppText(contact.phone, body);
      ok = res.ok;
      providerMsgId = res.messageId;
      error = res.error;
    } else if (configured(ENV.waReengageTemplate)) {
      // Outside the window → pre-approved template with one body parameter
      // carrying the whole rendered bilingual text.
      const res = await sendWhatsAppTemplate(contact.phone, ENV.waReengageTemplate, body);
      ok = res.ok;
      providerMsgId = res.messageId;
      error = res.error;
    } else {
      error = "outside_24h_no_template";
    }
  } else {
    if (!contact.email) return { status: "skipped", reason: "no_email" };
    const res = await sendResendEmail(contact.email, "Sama Hotel | فندق سما", body);
    ok = res.ok;
    providerMsgId = res.messageId;
    error = res.error;
  }

  await logMessage(db, {
    automationId: automation.id,
    contactId: contact.id,
    bookingId,
    channel,
    ok,
    body,
    error,
    providerMsgId,
  });

  return ok ? { status: "sent", reason: null } : { status: "failed", reason: error };
}

// ----------------------------------------------------------------------------
// Run summary
// ----------------------------------------------------------------------------
interface Bucket {
  matched: number;
  sent: number;
  skipped: number;
  failed: number;
  reasons: Record<string, number>;
}

function newBucket(): Bucket {
  return { matched: 0, sent: 0, skipped: 0, failed: 0, reasons: {} };
}

function count(bucket: Bucket, status: "sent" | "skipped" | "failed", reason: string | null): void {
  bucket[status] += 1;
  if (reason) bucket.reasons[reason] = (bucket.reasons[reason] ?? 0) + 1;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function capBatch<T>(rows: T[], label: string): T[] {
  if (rows.length > BATCH_CAP) {
    console.log(`[${label}] batch truncated to ${BATCH_CAP} (${rows.length} candidates matched)`);
    return rows.slice(0, BATCH_CAP);
  }
  return rows;
}

// ----------------------------------------------------------------------------
// Booking-driven triggers: booking_created (catch-up), pre_arrival, post_stay
// ----------------------------------------------------------------------------
async function processBookingAutomation(
  db: SupabaseClient,
  a: AutomationRow,
  kind: "booking_created" | "pre_arrival" | "post_stay",
  muscatToday: string,
  bucket: Bucket
): Promise<void> {
  let query = db.from("bookings").select(BOOKING_COLS).limit(BATCH_CAP + 1);
  if (kind === "booking_created") {
    // Catch-up for confirmations the instant /api/bookings hook missed.
    const cutoff = new Date(Date.now() - 48 * 3600e3).toISOString();
    query = query.gte("created_at", cutoff).eq("status", "Confirmed");
  } else if (kind === "pre_arrival") {
    // Date WINDOW (today+1 .. today+offset), not an exact date, so a single
    // missed daily run cannot skip a whole cohort; the (automation_id,
    // booking_id) dedupe below prevents resends within the window.
    const offset = a.offset_days ?? 2;
    query = query.eq("status", "Confirmed");
    query =
      offset >= 1
        ? query
            .gte("check_in", addDays(muscatToday, 1))
            .lte("check_in", addDays(muscatToday, offset))
        : query.eq("check_in", muscatToday);
  } else {
    // post_stay: 3-day look-back window (today-(offset+2) .. today-offset)
    // for the same missed-run resilience.
    const offset = a.offset_days ?? 1;
    query = query
      .gte("check_out", addDays(muscatToday, -(offset + 2)))
      .lte("check_out", addDays(muscatToday, -offset))
      .or("status.is.null,status.neq.Cancelled");
  }

  const { data, error } = await query;
  if (error) throw new Error(`bookings query failed: ${error.message}`);
  const bookings = capBatch((data ?? []) as BookingRow[], a.name ?? kind);
  bucket.matched += bookings.length;
  if (bookings.length === 0) return;

  // Dedupe ledger: a prior SUCCESSFUL send for (automation_id, booking_id).
  // Failed attempts (e.g. /api/bookings logging a failed confirmation) must
  // NOT block retries — the date windows naturally bound how long we retry.
  const already = new Set<string>();
  for (const ids of chunk(bookings.map((b) => b.id), 100)) {
    const { data: prior, error: dupErr } = await db
      .from("messages")
      .select("booking_id")
      .eq("automation_id", a.id)
      .eq("status", "sent")
      .in("booking_id", ids);
    if (dupErr) throw new Error(`dedupe query failed: ${dupErr.message}`);
    for (const m of (prior ?? []) as { booking_id: string | null }[]) {
      if (m.booking_id) already.add(m.booking_id);
    }
  }

  // Resolve contacts by contact_id in bulk.
  const contactsById = new Map<string, ContactRow>();
  const contactIds = [
    ...new Set(bookings.map((b) => b.contact_id).filter((v): v is string => Boolean(v))),
  ];
  for (const ids of chunk(contactIds, 100)) {
    const { data: rows, error: cErr } = await db
      .from("contacts")
      .select(CONTACT_COLS)
      .in("id", ids);
    if (cErr) throw new Error(`contacts query failed: ${cErr.message}`);
    for (const c of (rows ?? []) as ContactRow[]) contactsById.set(c.id, c);
  }

  // Phone fallback, bulk-prefetched (no per-booking query): distinct phones of
  // bookings whose contact_id is missing or didn't resolve above.
  const contactsByPhone = new Map<string, ContactRow>();
  const fallbackPhones = [
    ...new Set(
      bookings
        .filter((b) => !b.contact_id || !contactsById.has(b.contact_id))
        .map((b) => b.phone)
        .filter((v): v is string => Boolean(v))
    ),
  ];
  for (const phones of chunk(fallbackPhones, 100)) {
    const { data: rows, error: pErr } = await db
      .from("contacts")
      .select(CONTACT_COLS)
      .in("phone", phones);
    if (pErr) throw new Error(`contacts-by-phone query failed: ${pErr.message}`);
    for (const c of (rows ?? []) as ContactRow[]) {
      if (!contactsByPhone.has(c.phone)) contactsByPhone.set(c.phone, c);
    }
  }

  // Render + deliver + count for one booking; post_stay also stamps the
  // contact's stay facts. Runs CONCURRENCY-wide below.
  const handleBooking = async (booking: BookingRow, contact: ContactRow): Promise<void> => {
    let outcome: Outcome;
    if (!a.template) {
      outcome = { status: "skipped", reason: "no_template" };
    } else {
      const body = renderTemplate(a.template, {
        name: booking.guest ?? contact.name ?? "Guest",
        ref: booking.ref,
        check_in: booking.check_in,
        check_out: booking.check_out,
        room_type: booking.room_type ?? "-",
        terms_link: termsLink(),
      });
      outcome = await deliver(db, a, contact, body, booking.id);
    }
    count(bucket, outcome.status, outcome.reason);

    // post_stay: stamp the guest's stay facts onto the contact so win_back can
    // fire ~11 months later. Done for every matched stay regardless of the
    // send outcome — the stay happened either way. Never regress last_stay.
    if (kind === "post_stay" && booking.check_out) {
      const newer = !contact.last_stay || contact.last_stay < booking.check_out;
      if (newer) {
        const { error: upErr } = await db
          .from("contacts")
          .update({
            last_stay: booking.check_out,
            room_type: booking.room_type ?? contact.room_type,
          })
          .eq("id", contact.id);
        if (upErr) {
          console.error(`post_stay contact update failed (${contact.id}): ${upErr.message}`);
        }
      }
    }
  };

  // Cheap dedupe/contact checks stay synchronous; each surviving booking is
  // counted exactly once inside handleBooking.
  const dispatch: { booking: BookingRow; contact: ContactRow }[] = [];
  for (const booking of bookings) {
    if (already.has(booking.id)) {
      count(bucket, "skipped", "already_sent");
      continue;
    }
    let contact: ContactRow | null = booking.contact_id
      ? contactsById.get(booking.contact_id) ?? null
      : null;
    if (!contact && booking.phone) {
      contact = contactsByPhone.get(booking.phone) ?? null;
    }
    if (!contact) {
      count(bucket, "skipped", "no_contact");
      continue;
    }
    dispatch.push({ booking, contact });
  }

  for (const batch of chunk(dispatch, CONCURRENCY)) {
    await Promise.all(batch.map((item) => handleBooking(item.booking, item.contact)));
  }
}

// ----------------------------------------------------------------------------
// birthday — month-day match in Asia/Muscat, at most once per calendar year
// ----------------------------------------------------------------------------
async function processBirthdayAutomation(
  db: SupabaseClient,
  a: AutomationRow,
  muscatToday: string,
  bucket: Bucket
): Promise<void> {
  const monthDay = muscatToday.slice(5); // 'MM-DD'
  const yearStart = `${muscatToday.slice(0, 4)}-01-01`;

  // Page through all contacts with a birthday; the month-day filter runs in JS.
  const matches: ContactRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await db
      .from("contacts")
      .select(CONTACT_COLS)
      .not("birthday", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`contacts query failed: ${error.message}`);
    const rows = (data ?? []) as ContactRow[];
    for (const c of rows) {
      if ((c.birthday ?? "").slice(5, 10) === monthDay) matches.push(c);
    }
    if (rows.length < PAGE) break;
  }

  const list = capBatch(matches, a.name ?? "birthday");
  bucket.matched += list.length;
  if (list.length === 0) return;

  // Dedupe: no SUCCESSFUL (automation_id, contact_id) send since Jan 1 of the
  // current year — failed attempts don't block a retry.
  const already = new Set<string>();
  for (const ids of chunk(list.map((c) => c.id), 100)) {
    const { data: prior, error: dupErr } = await db
      .from("messages")
      .select("contact_id")
      .eq("automation_id", a.id)
      .eq("status", "sent")
      .in("contact_id", ids)
      .gte("sent_at", yearStart);
    if (dupErr) throw new Error(`dedupe query failed: ${dupErr.message}`);
    for (const m of (prior ?? []) as { contact_id: string | null }[]) {
      if (m.contact_id) already.add(m.contact_id);
    }
  }

  // Cheap skip checks stay synchronous; deliveries run CONCURRENCY-wide.
  const dispatch: ContactRow[] = [];
  for (const contact of list) {
    if (already.has(contact.id)) {
      count(bucket, "skipped", "already_sent");
      continue;
    }
    if (!a.template) {
      count(bucket, "skipped", "no_template");
      continue;
    }
    dispatch.push(contact);
  }

  const handleContact = async (contact: ContactRow): Promise<void> => {
    const body = renderTemplate(a.template ?? "", {
      name: contact.name,
      terms_link: termsLink(),
    });
    const outcome = await deliver(db, a, contact, body, null);
    count(bucket, outcome.status, outcome.reason);
  };

  for (const batch of chunk(dispatch, CONCURRENCY)) {
    await Promise.all(batch.map(handleContact));
  }
}

// ----------------------------------------------------------------------------
// win_back — last_stay within (today-(offset+3) .. today-offset), default
// offset 335 ≈ 11 months. The 4-day look-back window absorbs missed runs.
// ----------------------------------------------------------------------------
async function processWinBackAutomation(
  db: SupabaseClient,
  a: AutomationRow,
  muscatToday: string,
  bucket: Bucket
): Promise<void> {
  const offset = a.offset_days ?? 335;
  const windowStart = addDays(muscatToday, -(offset + 3));
  const windowEnd = addDays(muscatToday, -offset);

  const { data, error } = await db
    .from("contacts")
    .select(CONTACT_COLS)
    .gte("last_stay", windowStart)
    .lte("last_stay", windowEnd)
    .limit(BATCH_CAP + 1);
  if (error) throw new Error(`contacts query failed: ${error.message}`);
  const list = capBatch((data ?? []) as ContactRow[], a.name ?? "win_back");
  bucket.matched += list.length;
  if (list.length === 0) return;

  // Dedupe: any SUCCESSFUL (automation_id, contact_id) send after the window
  // START, so a contact matched anywhere in the window is messaged only once
  // per stay cycle — failed attempts don't block a retry.
  const already = new Set<string>();
  for (const ids of chunk(list.map((c) => c.id), 100)) {
    const { data: prior, error: dupErr } = await db
      .from("messages")
      .select("contact_id")
      .eq("automation_id", a.id)
      .eq("status", "sent")
      .in("contact_id", ids)
      .gt("sent_at", windowStart);
    if (dupErr) throw new Error(`dedupe query failed: ${dupErr.message}`);
    for (const m of (prior ?? []) as { contact_id: string | null }[]) {
      if (m.contact_id) already.add(m.contact_id);
    }
  }

  // Cheap skip checks stay synchronous; deliveries run CONCURRENCY-wide.
  const dispatch: ContactRow[] = [];
  for (const contact of list) {
    if (already.has(contact.id)) {
      count(bucket, "skipped", "already_sent");
      continue;
    }
    if (!a.template) {
      count(bucket, "skipped", "no_template");
      continue;
    }
    dispatch.push(contact);
  }

  const handleContact = async (contact: ContactRow): Promise<void> => {
    const body = renderTemplate(a.template ?? "", {
      name: contact.name,
      room_type: contact.room_type ?? "-",
      terms_link: termsLink(),
    });
    const outcome = await deliver(db, a, contact, body, null);
    count(bucket, outcome.status, outcome.reason);
  };

  for (const batch of chunk(dispatch, CONCURRENCY)) {
    await Promise.all(batch.map(handleContact));
  }
}

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------
function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (_req: Request) => {
  const startedAt = new Date().toISOString();
  try {
    if (!configured(ENV.supabaseUrl) || !configured(ENV.serviceRoleKey)) {
      const payload = {
        ok: false,
        started_at: startedAt,
        error: "missing_supabase_credentials (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
      };
      console.error(JSON.stringify(payload));
      return json(payload, 500);
    }

    const db = createClient(ENV.supabaseUrl, ENV.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const muscatToday = muscatTodayStr();

    const { data: autos, error } = await db
      .from("automations")
      .select("id, name, trigger_kind, channel, msg_type, market, offset_days, template, enabled")
      .eq("enabled", true);
    if (error) throw new Error(`automations query failed: ${error.message}`);

    const summary: Record<string, Bucket> = {};
    for (const a of (autos ?? []) as AutomationRow[]) {
      const kind = a.trigger_kind ?? "unknown";
      const bucket = (summary[kind] ??= newBucket());
      try {
        switch (kind) {
          case "booking_created":
          case "pre_arrival":
          case "post_stay":
            await processBookingAutomation(db, a, kind, muscatToday, bucket);
            break;
          case "birthday":
            await processBirthdayAutomation(db, a, muscatToday, bucket);
            break;
          case "win_back":
            await processWinBackAutomation(db, a, muscatToday, bucket);
            break;
          default:
            console.log(`automation ${a.id} skipped: unknown trigger_kind '${kind}'`);
        }
      } catch (e) {
        // One broken automation must never sink the whole run.
        console.error(`automation '${a.name ?? a.id}' (${kind}) errored: ${(e as Error).message}`);
        count(bucket, "failed", "automation_error");
      }
    }

    const payload = { ok: true, started_at: startedAt, muscat_today: muscatToday, summary };
    console.log(JSON.stringify(payload));
    return json(payload, 200);
  } catch (e) {
    const payload = {
      ok: false,
      started_at: startedAt,
      error: (e as Error)?.message ?? String(e),
    };
    console.error(JSON.stringify(payload));
    return json(payload, 500);
  }
});
