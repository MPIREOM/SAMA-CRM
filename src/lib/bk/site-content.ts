// Website content the owner controls from the back-office (/website):
// every photo slot on the guest site, the hero and welcome copy, and which
// optional sections show. Stored as one jsonb row in bk_settings (key
// "site"); anything left empty falls back to the defaults below, so the
// site always renders even before the owner has touched the page.
//
// Client-safe: no server imports. The server helper lives in
// src/components/guest/data.ts (getSiteContent) and the mutations in
// src/app/(crm)/(app)/website/actions.ts.

import type { Localized } from "@/lib/i18n";

export type SitePage = "brand" | "home" | "rooms" | "peak" | "apex" | "contact" | "policies" | "share";

export interface SiteImageSlot {
  key: string;
  page: SitePage;
  label: Localized;
  hint?: Localized;
  /** Path under /public or a public storage URL. */
  default: string;
  /** Recommended aspect ratio, shown in the back-office. */
  ratio: "16:9" | "4:3" | "3:2" | "1:1" | "3:4" | "wide";
}

export const SITE_IMAGE_SLOTS: readonly SiteImageSlot[] = [
  // Brand
  { key: "brand_logo", page: "brand", label: { en: "Logo (full)", ar: "الشعار الكامل" }, hint: { en: "Splash screen and footer. PNG with a transparent background.", ar: "شاشة البداية والتذييل. PNG بخلفية شفافة." }, default: "/images/brand/logo.png", ratio: "1:1" },
  { key: "brand_mark", page: "brand", label: { en: "Logo mark", ar: "رمز الشعار" }, hint: { en: "The small mark in the header.", ar: "الرمز الصغير في الترويسة." }, default: "/images/brand/logo-mark.png", ratio: "1:1" },

  // Home
  { key: "home_hero", page: "home", label: { en: "Hero photo", ar: "صورة الواجهة" }, hint: { en: "Full-screen behind the headline. Landscape, at least 1800 px wide.", ar: "بملء الشاشة خلف العنوان. أفقية، بعرض 1800 بكسل على الأقل." }, default: "/images/hotel/sunset-chalets.jpg", ratio: "16:9" },
  { key: "home_welcome_1", page: "home", label: { en: "Welcome — large photo", ar: "الترحيب — الصورة الكبيرة" }, default: "/images/hotel/pergola-seating.jpg", ratio: "3:4" },
  { key: "home_welcome_2", page: "home", label: { en: "Welcome — small photo", ar: "الترحيب — الصورة الصغيرة" }, default: "/images/hotel/canyon-view.jpg", ratio: "1:1" },
  { key: "home_experience_peak", page: "home", label: { en: "Experience — The Peak", ar: "التجارب — ذا بيك" }, default: "/images/hotel/peak-4.jpg", ratio: "4:3" },
  { key: "home_experience_pool", page: "home", label: { en: "Experience — Pool", ar: "التجارب — المسبح" }, default: "/images/hotel/pool-terrace.jpg", ratio: "4:3" },
  { key: "home_experience_terraces", page: "home", label: { en: "Experience — Terraces & season", ar: "التجارب — المدرجات والموسم" }, default: "/images/hotel/terraces.jpg", ratio: "4:3" },
  { key: "home_facility_pool", page: "home", label: { en: "Facilities — Pool & jacuzzi", ar: "المرافق — المسبح والجاكوزي" }, default: "/images/hotel/pool-wide.jpg", ratio: "4:3" },
  { key: "home_facility_restaurant", page: "home", label: { en: "Facilities — Restaurant", ar: "المرافق — المطعم" }, default: "/images/hotel/restaurant-new.jpg", ratio: "4:3" },
  { key: "home_facility_kids", page: "home", label: { en: "Facilities — Children's park", ar: "المرافق — حديقة الأطفال" }, default: "/images/hotel/kids-park-new.jpg", ratio: "4:3" },
  { key: "home_facility_gym", page: "home", label: { en: "Facilities — Fitness centre", ar: "المرافق — صالة اللياقة" }, default: "/images/hotel/gym.jpg", ratio: "4:3" },
  { key: "home_facility_peak", page: "home", label: { en: "Facilities — The Peak", ar: "المرافق — ذا بيك" }, default: "/images/hotel/peak-1.jpg", ratio: "4:3" },
  { key: "home_facility_majlis", page: "home", label: { en: "Facilities — Majlis", ar: "المرافق — المجلس" }, default: "/images/hotel/majlis.jpg", ratio: "4:3" },
  { key: "home_location", page: "home", label: { en: "Getting here", ar: "الوصول إلينا" }, default: "/images/hotel/aerial-canyon-pool.jpg", ratio: "4:3" },
  { key: "home_closing", page: "home", label: { en: "Closing photo", ar: "الصورة الختامية" }, hint: { en: "Wide band above the footer.", ar: "شريط عريض فوق التذييل." }, default: "/images/hotel/terrace-sunset.jpg", ratio: "wide" },

  // Rooms
  { key: "rooms_hero", page: "rooms", label: { en: "Rooms page — header photo", ar: "صفحة الغرف — صورة الترويسة" }, default: "/images/rooms/chalet/2.jpg", ratio: "wide" },

  // The Peak
  { key: "peak_hero", page: "peak", label: { en: "Hero photo", ar: "صورة الواجهة" }, default: "/images/hotel/peak-4.jpg", ratio: "16:9" },
  { key: "peak_1", page: "peak", label: { en: "Photo 1", ar: "الصورة 1" }, default: "/images/hotel/peak-1.jpg", ratio: "4:3" },
  { key: "peak_2", page: "peak", label: { en: "Photo 2", ar: "الصورة 2" }, default: "/images/hotel/peak-3.jpg", ratio: "1:1" },
  { key: "peak_3", page: "peak", label: { en: "Photo 3", ar: "الصورة 3" }, default: "/images/hotel/terrace-sunset.jpg", ratio: "1:1" },

  // APEX Zipline
  { key: "apex_hero", page: "apex", label: { en: "Hero photo", ar: "صورة الواجهة" }, hint: { en: "Leave the default to use the add-on's own image from Add-ons.", ar: "اتركوا الافتراضي لاستخدام صورة الإضافة من صفحة الإضافات." }, default: "", ratio: "16:9" },

  // Contact
  { key: "contact_1", page: "contact", label: { en: "Photo 1 (large)", ar: "الصورة 1 (كبيرة)" }, default: "/images/hotel/hotel-pool.jpg", ratio: "3:2" },
  { key: "contact_2", page: "contact", label: { en: "Photo 2", ar: "الصورة 2" }, default: "/images/hotel/chalets-courtyard.jpg", ratio: "1:1" },
  { key: "contact_3", page: "contact", label: { en: "Photo 3", ar: "الصورة 3" }, default: "/images/hotel/sign-sunset.jpg", ratio: "1:1" },

  // Policies
  { key: "policies_hero", page: "policies", label: { en: "Header photo", ar: "صورة الترويسة" }, default: "/images/hotel/entrance.jpg", ratio: "wide" },

  // Sharing
  { key: "og_image", page: "share", label: { en: "Social sharing image", ar: "صورة المشاركة الاجتماعية" }, hint: { en: "Shown when a link is shared on WhatsApp or social media. 1200 × 630.", ar: "تظهر عند مشاركة رابط على واتساب أو وسائل التواصل. 1200 × 630." }, default: "/images/og.jpg", ratio: "wide" },
] as const;

export type SiteImageKey = (typeof SITE_IMAGE_SLOTS)[number]["key"];

export const SITE_PAGES: { key: SitePage; label: Localized }[] = [
  { key: "brand", label: { en: "Brand", ar: "الهوية" } },
  { key: "home", label: { en: "Home", ar: "الرئيسية" } },
  { key: "rooms", label: { en: "Rooms", ar: "الغرف" } },
  { key: "peak", label: { en: "The Peak", ar: "ذا بيك" } },
  { key: "apex", label: { en: "APEX Zipline", ar: "أبكس زيبلاين" } },
  { key: "contact", label: { en: "Contact", ar: "التواصل" } },
  { key: "policies", label: { en: "Policies", ar: "السياسات" } },
  { key: "share", label: { en: "Sharing", ar: "المشاركة" } },
];

/** Copy the owner can override per language. Empty = use the built-in translation. */
export const SITE_COPY_FIELDS = [
  { key: "hero_eyebrow", label: { en: "Hero — small line above the title", ar: "الواجهة — السطر الصغير فوق العنوان" }, multiline: false },
  { key: "hero_title", label: { en: "Hero — title", ar: "الواجهة — العنوان" }, multiline: false },
  { key: "hero_subtitle", label: { en: "Hero — subtitle", ar: "الواجهة — العنوان الفرعي" }, multiline: true },
  { key: "welcome_eyebrow", label: { en: "Welcome — small line", ar: "الترحيب — السطر الصغير" }, multiline: false },
  { key: "welcome_title", label: { en: "Welcome — title", ar: "الترحيب — العنوان" }, multiline: false },
  { key: "welcome_body", label: { en: "Welcome — paragraph", ar: "الترحيب — الفقرة" }, multiline: true },
  { key: "closing_title", label: { en: "Closing line above the footer", ar: "السطر الختامي فوق التذييل" }, multiline: false },
  { key: "announcement", label: { en: "Announcement bar (leave empty to hide)", ar: "شريط الإعلان (اتركوه فارغاً لإخفائه)" }, multiline: false },
] as const;

export type SiteCopyKey = (typeof SITE_COPY_FIELDS)[number]["key"];

export const SITE_SECTION_TOGGLES = [
  { key: "welcome", label: { en: "Welcome section", ar: "قسم الترحيب" } },
  { key: "experiences", label: { en: "Experiences (The Peak, pool, terraces)", ar: "التجارب (ذا بيك، المسبح، المدرجات)" } },
  { key: "facilities", label: { en: "Facilities strip", ar: "شريط المرافق" } },
  { key: "addons", label: { en: "Add to your stay (zipline, transfers)", ar: "أضيفوا إلى إقامتكم (الزيبلاين، النقل)" } },
  { key: "location", label: { en: "Getting here", ar: "الوصول إلينا" } },
  { key: "closing", label: { en: "Closing photo band", ar: "شريط الصورة الختامي" } },
] as const;

export type SiteSectionKey = (typeof SITE_SECTION_TOGGLES)[number]["key"];

export interface SiteSettings {
  /** slot key → path or public URL; missing = default. */
  images: Record<string, string>;
  /** `${copyKey}_${lang}` → text; missing/empty = built-in translation. */
  copy: Record<string, string>;
  /** section key → shown; missing = true. */
  sections: Record<string, boolean>;
}

export const SITE_DEFAULTS: SiteSettings = { images: {}, copy: {}, sections: {} };

const SLOT_BY_KEY = new Map(SITE_IMAGE_SLOTS.map((s) => [s.key, s]));

export function siteSlot(key: string): SiteImageSlot | undefined {
  return SLOT_BY_KEY.get(key);
}

/** Resolved photo for a slot: the owner's upload, else the built-in default (empty when neither). */
export function siteImage(site: SiteSettings | null | undefined, key: SiteImageKey): string {
  const custom = site?.images?.[key];
  if (typeof custom === "string" && custom.trim() !== "") return custom;
  return SLOT_BY_KEY.get(key)?.default ?? "";
}

/** Owner's copy override for a key + language, or null when unset. */
export function siteCopy(site: SiteSettings | null | undefined, key: SiteCopyKey, lang: "en" | "ar"): string | null {
  const v = site?.copy?.[`${key}_${lang}`];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function siteSectionShown(site: SiteSettings | null | undefined, key: SiteSectionKey): boolean {
  const v = site?.sections?.[key];
  return typeof v === "boolean" ? v : true;
}

/** Only these sources may serve a custom image (they match next.config's remotePatterns). */
export function isAllowedImageSrc(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const u = new URL(src);
    if (!u.pathname.startsWith("/storage/v1/object/public/")) return false;
    if (u.protocol === "https:" && u.hostname.endsWith(".supabase.co")) return true;
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return Boolean(configured) && u.origin === new URL(configured!).origin;
  } catch {
    return false;
  }
}
