// Campaign recipient filtering — single source of truth for the campaigns UI
// (list page confirm-dialog count + new-campaign live count). The send API
// route (/api/campaigns/send) mirrors these exact rules server-side with the
// admin client.
//
// RULES:
// - Base: consent = true (marketing always requires opt-in).
// - Segment: "All" -> everyone; else contacts whose tags array contains it.
// - Market: "All" -> no market filter; "Oman+GCC" -> ["Oman","GCC"]; else [market].
// - WhatsApp (HARD RULE): market filter is ALWAYS intersected with
//   ["Oman","GCC"] — International contacts are never included. Phone is
//   always present so no extra column filter is needed.
// - Email: reaches all markets but requires a non-null email address.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campaign, Database } from "@/lib/database.types";
import { marketLabel, type Lang } from "@/lib/i18n";

export type CampaignChannel = "whatsapp" | "email";

export interface RecipientFilter {
  channel: CampaignChannel;
  /** "All" or a single tag. */
  segment: string;
  /** "All" | "Oman" | "GCC" | "Oman+GCC" | "International". */
  market: string;
}

/** Markets allowed to receive WhatsApp marketing (HARD RULE). */
export const WHATSAPP_MARKETING_MARKETS = ["Oman", "GCC"] as const;

/** Market choices offered per channel in the composer. */
export const WHATSAPP_MARKET_OPTIONS = ["Oman+GCC", "Oman", "GCC"] as const;
export const EMAIL_MARKET_OPTIONS = [
  "All",
  "Oman",
  "GCC",
  "Oman+GCC",
  "International",
] as const;

/**
 * Expand a campaign's market selection into concrete contact markets.
 * Returns `null` for "no market filter" (only possible for email + "All").
 * An empty array means "matches nobody" (e.g. whatsapp + International).
 */
export function expandMarkets(
  filter: Pick<RecipientFilter, "channel" | "market">
): string[] | null {
  let markets: string[] | null;
  if (filter.market === "All") markets = null;
  else if (filter.market === "Oman+GCC") markets = ["Oman", "GCC"];
  else markets = [filter.market];

  if (filter.channel === "whatsapp") {
    // HARD RULE: WhatsApp marketing never leaves Oman + GCC.
    markets =
      markets === null
        ? [...WHATSAPP_MARKETING_MARKETS]
        : markets.filter((m) =>
            (WHATSAPP_MARKETING_MARKETS as readonly string[]).includes(m)
          );
  }
  return markets;
}

/** Normalize a (nullable) campaign row into a RecipientFilter. */
export function campaignFilter(
  campaign: Pick<Campaign, "channel" | "segment" | "market">
): RecipientFilter {
  return {
    channel: campaign.channel === "email" ? "email" : "whatsapp",
    segment: campaign.segment ?? "All",
    market: campaign.market ?? "All",
  };
}

/**
 * Count opted-in recipients matching the filter using a head-only exact
 * count query (no rows transferred).
 */
export async function countRecipients(
  supabase: SupabaseClient<Database>,
  filter: RecipientFilter
): Promise<number> {
  const markets = expandMarkets(filter);
  if (markets !== null && markets.length === 0) return 0;

  let query = supabase
    .from("contacts")
    .select("id", { head: true, count: "exact" })
    .eq("consent", true);

  if (filter.segment !== "All") query = query.contains("tags", [filter.segment]);
  if (markets !== null) query = query.in("market", markets);
  if (filter.channel === "email") query = query.not("email", "is", null);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Bilingual label for a campaign's market value (incl. "All" / "Oman+GCC"). */
export function campaignMarketLabel(market: string | null, lang: Lang): string {
  if (!market || market === "All") return lang === "ar" ? "الكل" : "All";
  if (market === "Oman+GCC")
    return lang === "ar" ? "عُمان + الخليج" : "Oman + GCC";
  return marketLabel(market, lang);
}
