import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { formatOmr, type TaxSettings } from "@/lib/booking-engine/pricing";
import { cn } from "@/lib/utils";
import { pct } from "./lib";

// Itemised quote table. Works in server and client components (useTranslations
// is isomorphic). Tax percentages come from settings so labels stay honest.

export interface PriceLines {
  nightly: { date: string; rate: number }[];
  room_subtotal: number;
  discount_pct?: number;
  discount?: number;
  service_charge: number;
  tourism_fee: number;
  vat: number;
  total: number;
}

export function PriceSummary({
  quote,
  taxes,
  locale,
  className,
  breakdownOpen = false,
  compact = false,
}: {
  quote: PriceLines;
  taxes: TaxSettings;
  locale: Locale;
  className?: string;
  breakdownOpen?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("search");
  const tc = useTranslations("common");
  const discount = quote.discount ?? 0;
  const discountPct = quote.discount_pct ?? 0;

  return (
    <div className={cn("text-sm text-maroon-800", className)}>
      {quote.nightly.length > 0 && (
        <details open={breakdownOpen} className="group mb-3 rounded-xl border border-stone-200 bg-stone-50">
          <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 font-bold text-maroon-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
            <span>{t("nightlyBreakdown")}</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="border-t border-stone-200 px-3.5 py-2">
            {quote.nightly.map((night) => (
              <li key={night.date} className="flex items-center justify-between gap-3 py-1 tabular-nums">
                <span className="text-maroon-700">{formatLongDate(night.date, locale)}</span>
                <span dir="ltr" className="font-semibold">
                  {tc("omrAmount", { amount: formatOmr(night.rate) })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <dl className={cn("space-y-1.5 tabular-nums", compact && "space-y-1")}>
        <Row label={t("roomSubtotal")} value={quote.room_subtotal} />
        {discount > 0 && <Row label={t("discount", { pct: pct(discountPct) })} value={-discount} accent />}
        {(taxes.service_charge_enabled || quote.service_charge > 0) && (
          <Row label={t("serviceCharge", { pct: pct(taxes.service_charge_pct) })} value={quote.service_charge} muted />
        )}
        {(taxes.tourism_fee_enabled || quote.tourism_fee > 0) && (
          <Row label={t("tourismFee", { pct: pct(taxes.tourism_fee_pct) })} value={quote.tourism_fee} muted />
        )}
        {(taxes.vat_enabled || quote.vat > 0) && <Row label={t("vat", { pct: pct(taxes.vat_pct) })} value={quote.vat} muted />}
        <div className="flex items-baseline justify-between gap-3 border-t border-stone-200 pt-2.5">
          <dt className="text-base font-extrabold text-maroon-900">{t("total")}</dt>
          <dd dir="ltr" className="text-xl font-extrabold text-maroon-900">
            {tc("omrAmount", { amount: formatOmr(quote.total) })}
          </dd>
        </div>
      </dl>
      {!compact && <p className="mt-1.5 text-xs text-maroon-600">{t("totalHint")}</p>}
    </div>
  );
}

function Row({ label, value, muted, accent }: { label: string; value: number; muted?: boolean; accent?: boolean }) {
  const tc = useTranslations("common");
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn(muted ? "text-maroon-600" : "text-maroon-800", accent && "font-semibold text-jabal-700")}>{label}</dt>
      <dd dir="ltr" className={cn("font-semibold", accent && "text-jabal-700")}>
        {value < 0 ? `− ${tc("omrAmount", { amount: formatOmr(Math.abs(value)) })}` : tc("omrAmount", { amount: formatOmr(value) })}
      </dd>
    </div>
  );
}
