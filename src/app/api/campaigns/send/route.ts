import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplate } from "@/lib/templates";
import { sendToContact, type SendOutcome } from "@/lib/send-service";
import type { Contact } from "@/lib/database.types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RECIPIENT_CAP = 5000;
const CONCURRENCY = 5;

/** Markets allowed to receive WhatsApp marketing (HARD RULE). */
const WHATSAPP_MARKETING_MARKETS = ["Oman", "GCC"];

type Recipient = Pick<
  Contact,
  "id" | "phone" | "email" | "name" | "market" | "consent" | "last_inbound_at"
>;

/**
 * Server-side mirror of the recipient rules in
 * src/components/campaigns/recipients.ts:
 * - "All" -> no market filter; "Oman+GCC" -> ["Oman","GCC"]; else [market].
 * - WhatsApp is ALWAYS intersected with ["Oman","GCC"] — International
 *   contacts are never included regardless of the stored selection.
 * Returns null for "no market filter"; [] means "matches nobody".
 */
function expandMarkets(
  channel: "whatsapp" | "email",
  market: string
): string[] | null {
  let markets: string[] | null;
  if (market === "All") markets = null;
  else if (market === "Oman+GCC") markets = ["Oman", "GCC"];
  else markets = [market];

  if (channel === "whatsapp") {
    markets =
      markets === null
        ? [...WHATSAPP_MARKETING_MARKETS]
        : markets.filter((m) => WHATSAPP_MARKETING_MARKETS.includes(m));
  }
  return markets;
}

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
    if (campaign.status === "sent" || campaign.status === "sending") {
      return NextResponse.json({ error: "already_sent" }, { status: 409 });
    }

    const { error: markErr } = await admin
      .from("campaigns")
      .update({ status: "sending" })
      .eq("id", campaign.id);
    if (markErr) throw markErr;

    let sentCount = 0;
    let skipped = 0;
    let failed = 0;

    try {
      // --- Select recipients per the RECIPIENT RULES -------------------------
      const channel: "whatsapp" | "email" =
        campaign.channel === "email" ? "email" : "whatsapp";
      const segment = campaign.segment ?? "All";
      const markets = expandMarkets(channel, campaign.market ?? "All");

      let recipients: Recipient[] = [];
      if (markets === null || markets.length > 0) {
        let query = admin
          .from("contacts")
          .select("id,phone,email,name,market,consent,last_inbound_at")
          .eq("consent", true);
        if (segment !== "All") query = query.contains("tags", [segment]);
        if (markets !== null) query = query.in("market", markets);
        if (channel === "email") query = query.not("email", "is", null);

        const { data, error: recErr } = await query.limit(RECIPIENT_CAP);
        if (recErr) throw recErr;
        recipients = data ?? [];
      }

      // --- Send in chunks of 5 concurrent -------------------------------------
      const termsLink = process.env.TERMS_LINK ?? "";
      for (let i = 0; i < recipients.length; i += CONCURRENCY) {
        const chunk = recipients.slice(i, i + CONCURRENCY);
        const outcomes: SendOutcome[] = await Promise.all(
          chunk.map(async (contact) => {
            try {
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

    // --- Finalize ---------------------------------------------------------------
    const { error: finalErr } = await admin
      .from("campaigns")
      .update({
        status: sentCount === 0 && failed > 0 ? "failed" : "sent",
        sent: sentCount,
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
