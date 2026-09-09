import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplate, configuredTermsLink } from "@/lib/templates";
import { sendToContact, type SendOutcome } from "@/lib/send-service";
// Single source of truth for the recipient rules — the SAME module the
// composer uses for its live count, so preview and send can never diverge.
import { campaignFilter, expandMarkets } from "@/components/campaigns/recipients";
import type { Contact } from "@/lib/database.types";
import { resolveTemplateEnv } from "@/lib/whatsapp-templates";
import { listAllTemplates } from "@/lib/whatsapp-admin";
import {
  buildSendComponents,
  pickTemplateLanguage,
  renderTemplateText,
  type MetaTemplateSummary,
  type TemplateParamPlan,
} from "@/lib/messaging/meta-template-model";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RECIPIENT_CAP = 5000;
const CONCURRENCY = 5;
const DEDUPE_CHUNK = 200;
// A campaign stuck in 'sending' (serverless timeout mid-blast) may be resumed
// after this long; the messages ledger dedupe makes resumes safe.
const STALE_CLAIM_MS = 5 * 60 * 1000;

type Recipient = Pick<
  Contact,
  "id" | "phone" | "email" | "name" | "market" | "consent" | "last_inbound_at" | "lang" | "room_type"
>;

export async function POST(req: Request) {
  try {
    // --- Auth: signed-in super_admin only ------------------------------------
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // --- Validate -------------------------------------------------------------
    const payload = (await req.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    const id =
      payload && typeof payload.id === "string" && payload.id
        ? payload.id
        : null;
    if (!id) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    // --- Load campaign ----------------------------------------------------------
    const admin = createAdminClient();
    const { data: campaign, error: loadErr } = await admin
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!campaign) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (campaign.status === "sent") {
      return NextResponse.json({ error: "already_sent" }, { status: 409 });
    }

    // ATOMIC claim — check-then-set would let two concurrent requests both
    // blast the campaign. The conditional UPDATE only succeeds for one caller:
    // drafts/failed claim freely; 'sending' rows may only be re-claimed once
    // the previous claim (stamped into scheduled_for) has gone stale, which
    // resumes campaigns killed by a serverless timeout.
    const nowIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    let claim = admin
      .from("campaigns")
      .update({ status: "sending", scheduled_for: nowIso })
      .eq("id", campaign.id);
    claim =
      campaign.status === "sending"
        ? claim
            .eq("status", "sending")
            .or(`scheduled_for.is.null,scheduled_for.lt.${staleIso}`)
        : claim.or("status.is.null,status.in.(draft,failed)");
    const { data: claimed, error: markErr } = await claim.select("id");
    if (markErr) throw markErr;
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: "already_sending" }, { status: 409 });
    }

    let sentCount = 0;
    let skipped = 0;
    let failed = 0;

    try {
      // Template campaigns: load the approved language variants once. A
      // campaign whose template is not approved (yet) fails fast instead of
      // burning through the recipient list. Inside the try so a Meta/DB
      // failure marks the campaign failed instead of leaving it "sending".
      let variants: MetaTemplateSummary[] = [];
      const plan = (campaign.wa_template_params ?? null) as TemplateParamPlan | null;
      if (campaign.wa_template_name) {
        const t = await resolveTemplateEnv();
        const listed = t.wabaId ? await listAllTemplates(t.wabaId, t.env) : null;
        variants = listed?.ok ? listed.data.filter((v) => v.name === campaign.wa_template_name && v.status === "APPROVED") : [];
        if (variants.length === 0 || !plan) {
          await admin.from("campaigns").update({ status: "failed", scheduled_for: null }).eq("id", campaign.id);
          return NextResponse.json({ error: "template_not_approved" }, { status: 409 });
        }
      }

      // --- Select recipients per the shared RECIPIENT RULES ------------------
      const filter = campaignFilter(campaign);
      const channel = filter.channel;
      const markets = expandMarkets(filter);

      let recipients: Recipient[] = [];
      if (markets === null || markets.length > 0) {
        let query = admin
          .from("contacts")
          .select("id,phone,email,name,market,consent,last_inbound_at,lang,room_type")
          .eq("consent", true);
        if (filter.segment !== "All")
          query = query.contains("tags", [filter.segment]);
        if (markets !== null) query = query.in("market", markets);
        if (channel === "email") query = query.not("email", "is", null);

        const { data, error: recErr } = await query.limit(RECIPIENT_CAP);
        if (recErr) throw recErr;
        recipients = data ?? [];
      }

      // --- Ledger dedupe: never message the same contact twice for one
      // campaign, which makes resumed/retried sends safe ------------------------
      const attempted = new Set<string>();
      const ids = recipients.map((r) => r.id);
      for (let i = 0; i < ids.length; i += DEDUPE_CHUNK) {
        const { data: prior, error: dupErr } = await admin
          .from("messages")
          .select("contact_id")
          .eq("campaign_id", campaign.id)
          .in("contact_id", ids.slice(i, i + DEDUPE_CHUNK));
        if (dupErr) throw dupErr;
        for (const m of prior ?? []) {
          if (m.contact_id) attempted.add(m.contact_id);
        }
      }
      recipients = recipients.filter((r) => !attempted.has(r.id));

      // --- Send in chunks of 5 concurrent -------------------------------------
      const termsLink = configuredTermsLink();
      for (let i = 0; i < recipients.length; i += CONCURRENCY) {
        const chunk = recipients.slice(i, i + CONCURRENCY);
        const outcomes: SendOutcome[] = await Promise.all(
          chunk.map(async (contact) => {
            try {
              if (campaign.wa_template_name && plan) {
                const variant = pickTemplateLanguage(variants, contact.lang);
                if (!variant) return { sent: false, skipped: false, reason: "template_not_approved" };
                const guest = { name: contact.name, room_type: contact.room_type, terms_link: termsLink };
                return await sendToContact({
                  contact,
                  channel,
                  msgType: "marketing",
                  body: renderTemplateText(variant, plan, guest),
                  campaignId: campaign.id,
                  template: { name: variant.name, language: variant.language, components: buildSendComponents(variant, plan, guest) },
                });
              }
              const body = renderTemplate(campaign.body ?? "", {
                name: contact.name,
                terms_link: termsLink,
              });
              // sendToContact enforces consent + market rules again and logs
              // every attempt to `messages`.
              return await sendToContact({
                contact,
                channel,
                msgType: "marketing",
                body,
                subject: campaign.name ?? undefined,
                campaignId: campaign.id,
              });
            } catch {
              return { sent: false, skipped: false, reason: "send_error" };
            }
          })
        );
        for (const outcome of outcomes) {
          if (outcome.sent) sentCount += 1;
          else if (outcome.skipped) skipped += 1;
          else failed += 1;
        }
      }
    } catch (err) {
      console.error("POST /api/campaigns/send delivery failed:", err);
      // Best effort: don't leave the campaign stuck in "sending".
      await admin
        .from("campaigns")
        .update({ status: "failed", sent: sentCount, scheduled_for: null })
        .eq("id", campaign.id);
      return NextResponse.json({ error: "send_failed" }, { status: 500 });
    }

    // --- Finalize: `sent` comes from the ledger so resumed runs accumulate ----
    const { count: totalSent } = await admin
      .from("messages")
      .select("id", { head: true, count: "exact" })
      .eq("campaign_id", campaign.id)
      .eq("status", "sent");

    const { error: finalErr } = await admin
      .from("campaigns")
      .update({
        status: (totalSent ?? sentCount) === 0 && failed > 0 ? "failed" : "sent",
        sent: totalSent ?? sentCount,
        scheduled_for: null,
      })
      .eq("id", campaign.id);
    if (finalErr) throw finalErr;

    return NextResponse.json({ sent: sentCount, skipped, failed });
  } catch (err) {
    console.error("POST /api/campaigns/send failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
