import type { Market } from "@/lib/database.types";

// Country codes offered in phone inputs. Oman first (default), then GCC,
// then common international markets.
export interface CountryCode {
  code: string; // dialling code with +
  iso: string; // ISO 3166-1 alpha-2
  en: string;
  ar: string;
  flag: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: "+968", iso: "OM", en: "Oman", ar: "عُمان", flag: "🇴🇲" },
  { code: "+966", iso: "SA", en: "Saudi Arabia", ar: "السعودية", flag: "🇸🇦" },
  { code: "+971", iso: "AE", en: "UAE", ar: "الإمارات", flag: "🇦🇪" },
  { code: "+965", iso: "KW", en: "Kuwait", ar: "الكويت", flag: "🇰🇼" },
  { code: "+974", iso: "QA", en: "Qatar", ar: "قطر", flag: "🇶🇦" },
  { code: "+973", iso: "BH", en: "Bahrain", ar: "البحرين", flag: "🇧🇭" },
  { code: "+20", iso: "EG", en: "Egypt", ar: "مصر", flag: "🇪🇬" },
  { code: "+91", iso: "IN", en: "India", ar: "الهند", flag: "🇮🇳" },
  { code: "+92", iso: "PK", en: "Pakistan", ar: "باكستان", flag: "🇵🇰" },
  { code: "+880", iso: "BD", en: "Bangladesh", ar: "بنغلاديش", flag: "🇧🇩" },
  { code: "+63", iso: "PH", en: "Philippines", ar: "الفلبين", flag: "🇵🇭" },
  { code: "+44", iso: "GB", en: "United Kingdom", ar: "المملكة المتحدة", flag: "🇬🇧" },
  { code: "+49", iso: "DE", en: "Germany", ar: "ألمانيا", flag: "🇩🇪" },
  { code: "+33", iso: "FR", en: "France", ar: "فرنسا", flag: "🇫🇷" },
  { code: "+1", iso: "US", en: "USA / Canada", ar: "أمريكا / كندا", flag: "🇺🇸" },
  { code: "+7", iso: "RU", en: "Russia", ar: "روسيا", flag: "🇷🇺" },
  { code: "+86", iso: "CN", en: "China", ar: "الصين", flag: "🇨🇳" },
  { code: "+90", iso: "TR", en: "Türkiye", ar: "تركيا", flag: "🇹🇷" },
];

const GCC_PREFIXES = ["+966", "+971", "+965", "+974", "+973"];

/**
 * Normalize any phone input to E.164-ish form (+ followed by digits).
 * Handles Arabic-Indic digits, spaces, dashes, leading 00, and wa_id values
 * (which arrive without a +). Returns null when unusable.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Convert Arabic-Indic (٠-٩) and Extended (۰-۹) digits to ASCII.
  let s = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  s = s.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    // wa_id / bare numbers: assume the country code is already included when
    // long enough, otherwise treat as an Omani local number. A national
    // number written with a trunk '0' (e.g. 0501234567) is ambiguous — we
    // can't know the country — so reject it and let the caller pick a code.
    let digits = s.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("0")) {
      digits = digits.replace(/^0+/, "");
      if (digits.length > 8) return null; // ambiguous national format
    }
    s = digits.length <= 8 ? "+968" + digits : "+" + digits;
  }
  let digits = s.slice(1).replace(/\D/g, "");
  // Strip a trunk '0' typed after the country code (e.g. +966 0501234567 —
  // Meta's wa_id format has no trunk zero).
  for (const { code } of COUNTRY_CODES) {
    const cc = code.slice(1);
    if (digits.startsWith(cc + "0")) {
      digits = cc + digits.slice(cc.length).replace(/^0+/, "");
      break;
    }
  }
  if (digits.length < 7 || digits.length > 15) return null;
  return "+" + digits;
}

/** Mirrors the DB generated column: +968 → Oman; KSA/UAE/KW/QA/BH → GCC. */
export function marketFromPhone(phone: string | null | undefined): Market {
  if (!phone || !phone.startsWith("+")) return "Unknown";
  if (phone.startsWith("+968")) return "Oman";
  if (GCC_PREFIXES.some((p) => phone.startsWith(p))) return "GCC";
  return "International";
}

/** WhatsApp Cloud API wants the number without the leading +. */
export function toWaId(phone: string): string {
  return phone.replace(/^\+/, "");
}

/** wa_id (e.g. "96891234567") → stored phone format ("+96891234567"). */
export function fromWaId(waId: string): string | null {
  return normalizePhone("+" + waId.replace(/\D/g, ""));
}

/** Markets allowed to receive WhatsApp *marketing* content. HARD RULE. */
export const MARKETING_MARKETS: Market[] = ["Oman", "GCC"];

export function canReceiveWhatsAppMarketing(market: string | null): boolean {
  return market === "Oman" || market === "GCC";
}
