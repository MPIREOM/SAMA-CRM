"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { nightsBetween } from "@/lib/booking-engine/pricing";
import { AvailabilityWidget, type AvailabilityWidgetProps } from "./availability-widget";
import { n } from "./lib";
import type { SearchQuery } from "./schemas";

// The current search as a slim bar in the language of the booking bar: white,
// hairline cells, serif dates. "Edit" reveals the availability widget below,
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
  const nights = nightsBetween(query.checkin, query.checkout);

  const cell = "flex flex-col justify-center gap-1.5 px-4 py-3.5 sm:px-5";
  const label = "g-eyebrow text-[10px]";
  const value = "font-display text-[1.35rem] leading-none text-ink tabular-nums rtl:font-display-ar";

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
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="search-edit" className="g-btn-outline g-btn-sm px-4">
            {open ? t("close") : t("edit")}
          </button>
        </div>
      </div>
      <div id="search-edit" hidden={!open} className="mt-3">
        {open && <AvailabilityWidget {...widget} id="availability" variant="panel" initial={query} autoFocus onSubmitted={() => setOpen(false)} />}
      </div>
    </div>
  );
}
