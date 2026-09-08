import type { Metadata } from "next";
import type { Locale } from "@/i18n/routing";

// Per-page metadata with hreflang alternates + Open Graph, relative to the
// metadataBase set in src/app/[locale]/layout.tsx.

export function pageMetadata(opts: {
  locale: Locale;
  path: string; // without locale prefix, e.g. "/rooms/chalet"
  title: string;
  description: string;
  image?: string;
  noIndex?: boolean;
}): Metadata {
  const path = opts.path === "/" ? "" : opts.path;
  const image = opts.image ?? "/images/og.jpg";
  return {
    title: opts.title,
    description: opts.description,
    alternates: {
      canonical: `/${opts.locale}${path}`,
      languages: { en: `/en${path}`, ar: `/ar${path}`, "x-default": `/en${path}` },
    },
    openGraph: {
      type: "website",
      title: opts.title,
      description: opts.description,
      locale: opts.locale === "ar" ? "ar_OM" : "en_GB",
      url: `/${opts.locale}${path}`,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description, images: [image] },
    ...(opts.noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
