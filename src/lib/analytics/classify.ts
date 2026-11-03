// Pure helpers that turn a raw guest-site hit into the columns of
// bk_web_events (migration 0014). No server imports: unit-tested directly.

export type PageType = "home" | "rooms" | "room" | "results" | "booking" | "confirmation" | "manage" | "content" | "other";
export type Device = "mobile" | "tablet" | "desktop";

const LOCALES = ["en", "ar"];

/** "/en/book/chalet" → { locale: "en", pageType: "booking", roomSlug: "chalet" }. */
export function classifyPath(path: string): { locale: string | null; pageType: PageType; roomSlug: string | null; bookingRef: string | null } {
  const parts = path.split("?")[0].split("/").filter(Boolean);
  const locale = parts[0] && LOCALES.includes(parts[0]) ? parts[0] : null;
  const rest = locale ? parts.slice(1) : parts;
  const [a, b, c] = rest;
  let pageType: PageType = "other";
  let roomSlug: string | null = null;
  let bookingRef: string | null = null;
  if (!a) pageType = "home";
  else if (a === "rooms") {
    pageType = b ? "room" : "rooms";
    roomSlug = b ?? null;
  } else if (a === "book") {
    pageType = b ? "booking" : "results";
    roomSlug = b ?? null;
  } else if (a === "booking" && b) {
    pageType = c === "manage" ? "manage" : "confirmation";
    bookingRef = b.toUpperCase().slice(0, 32);
  } else if (["the-peak", "apex-zipline", "contact", "policies"].includes(a)) pageType = "content";
  return { locale, pageType, roomSlug: roomSlug?.slice(0, 80) ?? null, bookingRef };
}

/** Host of a referrer URL, lower-cased, without a leading "www."; null when absent or invalid. */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const h = new URL(referrer).hostname.toLowerCase();
    return h ? h.replace(/^www\./, "").slice(0, 120) : null;
  } catch {
    return null;
  }
}

const CHANNELS: [RegExp, string][] = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\./, "yahoo"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com|l\.facebook\.com)$/, "facebook"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "youtube"],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, "linkedin"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)tripadvisor\./, "tripadvisor"],
  [/(^|\.)booking\.com$/, "booking.com"],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com)$/, "ai assistant"],
];

/**
 * Where the visit came from: an explicit utm_source wins; otherwise a known
 * channel derived from the referrer host; otherwise the host itself; "direct"
 * when there is no external referrer.
 */
export function trafficSource(utmSource: string | null | undefined, refHost: string | null, ownHosts: string[] = []): string {
  const utm = utmSource?.trim().toLowerCase().slice(0, 60);
  if (utm) return utm;
  if (!refHost || ownHosts.some((h) => refHost === h.replace(/^www\./, ""))) return "direct";
  for (const [re, name] of CHANNELS) if (re.test(refHost)) return name;
  return refHost;
}

export function deviceFromUa(ua: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

export function browserFromUa(ua: string): string {
  if (/Instagram/i.test(ua)) return "Instagram app";
  if (/FBAN|FBAV/i.test(ua)) return "Facebook app";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/CriOS|Chrome\//.test(ua)) return "Chrome";
  if (/FxiOS|Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

/** Crawlers, link previews, monitors and headless browsers — not visitors. */
export function isBot(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 20) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|curl|wget|python|httpclient|axios|node-fetch|headless|lighthouse|pagespeed|vercel|uptime|monitor|playwright|puppeteer/i.test(ua);
}
