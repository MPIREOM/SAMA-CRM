"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Cookie-free page-view beacon (see /api/bk/track and migration 0014).
// The session id and the landing referrer/UTM live in sessionStorage only, so
// every page of one visit is credited to where that visit came from.

type Landing = { sid: string; referrer: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null };

const KEY = "sama_visit";

function landing(): Landing | null {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) return JSON.parse(saved) as Landing;
    const q = new URLSearchParams(window.location.search);
    const sid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const l: Landing = {
      sid,
      referrer: document.referrer || null,
      utm_source: q.get("utm_source"),
      utm_medium: q.get("utm_medium"),
      utm_campaign: q.get("utm_campaign"),
    };
    sessionStorage.setItem(KEY, JSON.stringify(l));
    return l;
  } catch {
    return null; // storage blocked (private mode, embedded): skip tracking
  }
}

/** Send one event. Safe to call anywhere on the guest site; never throws. */
export function trackEvent(kind: "pageview" | "booking_review", extra: { path?: string; room?: string } = {}): void {
  try {
    const l = landing();
    if (!l) return;
    const body = JSON.stringify({ kind, path: extra.path ?? window.location.pathname, room: extra.room, ...l });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/bk/track", blob)) {
      void fetch("/api/bk/track", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
    }
  } catch {
    /* ignore */
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) trackEvent("pageview", { path: pathname });
  }, [pathname]);
  return null;
}
