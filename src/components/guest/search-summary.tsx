"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Pencil, Users, X } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { nightsBetween } from "@/lib/booking-engine/pricing";
import { AvailabilityWidget, type AvailabilityWidgetProps } from "./availability-widget";
import { n } from "./lib";
import type { SearchQuery } from "./schemas";

// Sticky-ish summary of the current search with an "Edit" toggle that reveals
// the availability widget prefilled with the same values.

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

  return (
    <div className="g-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-maroon-800">
          <span className="inline-flex items-center gap-2 font-semibold">
            <CalendarDays className="h-4 w-4 text-gold-700" aria-hidden="true" />
            <span>
              {t("summary", { checkIn: formatLongDate(query.checkin, locale), checkOut: formatLongDate(query.checkout, locale) })}
            </span>
            <span className="text-maroon-600">· {tc("nights", { count: nights, n: n(nights) })}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-gold-700" aria-hidden="true" />
            <span>{t("guestsSummary", { adults: query.adults, a: n(query.adults), children: query.children, c: n(query.children) })}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="search-edit"
          className="g-btn-outline g-btn-sm"
        >
          {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
          {open ? t("close") : t("edit")}
        </button>
      </div>
      <div id="search-edit" hidden={!open} className="mt-4">
        {open && (
          <AvailabilityWidget
            {...widget}
            id="availability"
            variant="panel"
            initial={query}
            autoFocus
            onSubmitted={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
