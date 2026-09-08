import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/routing";
import { getRoomTypes } from "@/lib/bk/catalogue";
import { logger } from "@/lib/logger";

// Guest-site sitemap: static pages × locales + every active room type.
// CRM and booking-flow URLs are deliberately excluded (see robots.ts).

// Generated per request (cached by the CDN) so room slugs are never frozen at build time.
export const dynamic = "force-dynamic";

const STATIC_PATHS = ["", "/rooms", "/the-peek", "/apex-zipline", "/contact", "/policies"] as const;

function base(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://sama-crm.vercel.app").replace(/\/$/, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = base();
  let roomSlugs: string[] = [];
  try {
    roomSlugs = (await getRoomTypes()).map((rt) => rt.slug);
  } catch (err) {
    logger.warn("sitemap", "room types unavailable", { error: err instanceof Error ? err.message : String(err) });
  }
  const paths = [...STATIC_PATHS, ...roomSlugs.map((slug) => `/rooms/${slug}`)];
  const now = new Date();

  return paths.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${origin}/${locale}${path}`,
      lastModified: now,
      changeFrequency: path === "" ? "weekly" : "monthly",
      priority: path === "" ? 1 : path.startsWith("/rooms") || path === "/apex-zipline" ? 0.8 : 0.5,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, `${origin}/${l}${path}`])),
      },
    }))
  );
}
