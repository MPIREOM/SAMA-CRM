import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { browserFromUa, classifyPath, deviceFromUa, isBot, referrerHost, trafficSource } from "@/lib/analytics/classify";

// Public, cookie-free page-view beacon for the guest site (see migration 0014).
// Always answers 204 so a tracking problem can never break a page.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["pageview", "booking_review"]).default("pageview"),
  path: z.string().min(1).max(300).startsWith("/"),
  referrer: z.string().max(500).nullish(),
  sid: z.string().min(8).max(64),
  utm_source: z.string().max(100).nullish(),
  utm_medium: z.string().max(100).nullish(),
  utm_campaign: z.string().max(100).nullish(),
  room: z.string().max(80).nullish(),
});

const noContent = () => new NextResponse(null, { status: 204 });

function muscatDay(): string {
  return new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get("user-agent") ?? "";
    if (isBot(ua) && process.env.ANALYTICS_TRACK_HEADLESS !== "1") return noContent();
    if (req.headers.get("x-purpose") === "prefetch" || req.headers.get("purpose") === "prefetch") return noContent();

    const raw = await req.text();
    if (raw.length > 4000) return noContent();
    const parsed = Body.safeParse(JSON.parse(raw));
    if (!parsed.success) return noContent();
    const b = parsed.data;

    const path = b.path.split("?")[0].split("#")[0];
    const { locale, pageType, roomSlug, bookingRef } = classifyPath(path);
    const ownHost = req.headers.get("host") ?? "";
    const refHost = referrerHost(b.referrer);
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "0.0.0.0";
    const secret = process.env.ANALYTICS_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "sama";
    const visitorId = createHash("sha256").update(`${muscatDay()}|${ip}|${ua}|${secret}`).digest("hex").slice(0, 32);
    const country = (req.headers.get("x-vercel-ip-country") ?? "").toUpperCase().slice(0, 2) || null;

    const admin = createAdminClient();
    await admin.from("bk_web_events").insert({
      kind: b.kind,
      visitor_id: visitorId,
      session_id: b.sid,
      path,
      page_type: pageType,
      locale,
      referrer_host: refHost && refHost !== ownHost.replace(/^www\./, "") ? refHost : null,
      source: trafficSource(b.utm_source, refHost, [ownHost, "samahotel.net", "sama-crm.vercel.app"]),
      utm_medium: b.utm_medium?.toLowerCase() || null,
      utm_campaign: b.utm_campaign?.toLowerCase() || null,
      country,
      device: deviceFromUa(ua),
      browser: browserFromUa(ua),
      room_slug: b.room ?? roomSlug,
      booking_ref: bookingRef,
    });
  } catch {
    // Never surface tracking errors to the visitor.
  }
  return noContent();
}
