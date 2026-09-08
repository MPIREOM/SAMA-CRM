import type { MetadataRoute } from "next";

// Public guest site is crawlable; the CRM, kiosk, API and the booking flow
// (results, forms, token-gated confirmation pages) are not.

const CRM_PREFIXES = [
  "/dashboard",
  "/bookings",
  "/reservations",
  "/calendar",
  "/rates",
  "/blocks",
  "/messaging",
  "/settings",
  "/audit",
  "/inbox",
  "/contacts",
  "/automations",
  "/campaigns",
  "/users",
  "/login",
  "/checkin",
  "/api",
];

const GUEST_PRIVATE = ["/en/book", "/ar/book", "/en/booking", "/ar/booking"];

export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://sama-crm.vercel.app").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...CRM_PREFIXES.map((p) => `${p}/`), ...CRM_PREFIXES, ...GUEST_PRIVATE.map((p) => `${p}/`), ...GUEST_PRIVATE],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
