// The deployment's public origin, without a trailing slash. Everything that
// builds an absolute link — page metadata, sitemap and robots, guest booking
// links in emails and WhatsApp, the desk alert's back-office button, the
// WhatsApp webhook callback — goes through here, so moving the site to a new
// domain is one environment variable: NEXT_PUBLIC_APP_URL. Safe to import
// from client components (no server-only), and `process.env.NEXT_PUBLIC_…`
// is spelled out so Next.js can inline it in the browser bundle.

export const FALLBACK_APP_URL = "https://sama-crm.vercel.app";

function usable(value: string | undefined): value is string {
  return !!value && !value.includes("YOUR_") && /^https?:\/\//i.test(value);
}

export function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (usable(raw) ? raw : FALLBACK_APP_URL).replace(/\/+$/, "");
}

/** The configured origin, or null when the variable is unset, a placeholder or not a URL (the settings page shows that as "not set"). */
export function configuredAppUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return usable(raw) ? raw.replace(/\/+$/, "") : null;
}
