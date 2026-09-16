"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { nightsBetween } from "@/lib/booking-engine/pricing";
import { cn } from "@/lib/utils";
import { AvailabilityWidget, type AvailabilityWidgetProps } from "./availability-widget";
import { n } from "./lib";
import type { SearchQuery } from "./schemas";

// The current search as a slim bar in the language of the booking bar: white,
// hairline cells, serif dates. "Edit" unfolds the availability widget below
// (.g-collapse: height + fade, out of the tab order while closed),
// prefilled with the same values.

export function SearchSummary({
  query,
  locale,
  widget,
  defaultOpen = false,
}: {
  query: SearchQuery;
  locale: Locale;
  widget: Omit<AvailabilityWidgetProps, "initial" | "variant" | "id" | "onSubmitted">;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("search");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(defaultOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const nights = nightsBetween(query.checkin, query.checkout);

  function toggle() {
    const next = !open;
    setOpen(next);
    // The panel is visible at once (only its height eases), so the first field can take focus straight away.
    if (next) window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }));
  }

  const cell = "flex flex-col justify-center gap-1.5 px-4 py-3.5 sm:px-5";
  const label = "g-eyebrow";
  const value = "g-h4 leading-none tabular-nums";

  return (
    <div>
      <div className="g-card grid grid-cols-2 divide-ink-line md:grid-cols-[1.2fr_1.2fr_1fr_auto] md:divide-x rtl:md:divide-x-reverse">
        <div className={`${cell} border-b border-ink-line md:border-b-0`}>
          <span className={label}>{t("checkInLabel")}</span>
          <span className={value}>{formatLongDate(query.checkin, locale)}</span>
        </div>
        <div className={`${cell} border-b border-s border-ink-line md:border-b-0 md:border-s-0`}>
          <span className={label}>{t("checkOutLabel")}</span>
          <span className={value}>{formatLongDate(query.checkout, locale)}</span>
        </div>
        <div className={cell}>
          <span className={label}>{t("guestsLabel")}</span>
          <span className={value}>{t("guestsSummary", { adults: query.adults, a: n(query.adults), children: query.children, c: n(query.children) })}</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-s border-ink-line px-3 py-3 md:border-s-0 md:gap-5 md:px-5">
          <span className="shrink-0 text-xs text-ink-mute tabular-nums sm:text-sm">{tc("nights", { count: nights, n: n(nights) })}</span>
          <button type="button" onClick={toggle} aria-expanded={open} aria-controls="search-edit" className="g-btn-outline g-btn-sm px-4">
            {open ? t("close") : t("edit")}
          </button>
        </div>
      </div>
      <div id="search-edit" ref={panelRef} className={cn("g-collapse", open && "is-open")}>
        <div>
          <div className="pt-3">
            <AvailabilityWidget {...widget} id="availability" variant="panel" initial={query} autoFocus={defaultOpen} onSubmitted={() => setOpen(false)} />
          </div>
        </div>
      </div>
    </div>
  );
}
