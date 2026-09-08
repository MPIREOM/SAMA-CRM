import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

// Guest-site locales. `ar` renders RTL (see src/app/[locale]/layout.tsx).
export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeDetection: true,
});

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "ar";
}

// Locale-aware navigation helpers for the guest site. Always use these
// instead of next/link + next/navigation inside src/app/[locale].
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
