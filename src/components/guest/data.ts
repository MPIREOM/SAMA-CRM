import "server-only";

import { cache } from "react";
import { getPublicSettings, SETTINGS_DEFAULTS } from "@/lib/bk/settings";
import type { PublicSettings } from "@/lib/bk/types";
import { logger } from "@/lib/logger";

// Server-side helpers for guest pages.

/**
 * Public settings with a safe fallback: the site chrome (header, footer,
 * contact details) must never crash on a transient database error. Pages that
 * need live data (availability, quotes) still call getPublicSettings directly.
 */
export const safePublicSettings = cache(async (): Promise<PublicSettings> => {
  try {
    return await getPublicSettings();
  } catch (err) {
    logger.warn("guest.settings", "falling back to default settings", {
      error: err instanceof Error ? err.message : String(err),
    });
    const { times, cancellation, contact, booking, taxes, reviews, hotel } = SETTINGS_DEFAULTS;
    return { times, cancellation, contact, booking, taxes, reviews, hotel };
  }
});

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://sama-crm.vercel.app").replace(/\/$/, "");
}
