import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { formatOmr, type TaxSettings } from "@/lib/booking-engine/pricing";
import { cn } from "@/lib/utils";
import { n, pct, type AddonPriceLine } from "./lib";

// Itemised quote: hairline rows, the total in serif. Works in server and
// client components (useTranslations is isomorphic). Tax percentages come
// from settings so labels stay honest. Add-ons (APEX Zipline, transfers) are
// not taxed, so they sit after the tax lines with their own "paid at the
// hotel" subtotal, right above the total.

export interface PriceLines {
  nightly: { date: string; rate: number }[];
  room_subtotal: number;
  discount_pct?: number;
  discount?: number;
  service_charge: number;
  tourism_fee: number;
  vat: number;
  total: number;
  addons?: AddonPriceLine[];
  addons_total?: number;
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
  const ta = useTranslations("addons");
  const tc = useTranslations("common");
  const discount = quote.discount ?? 0;
  const discountPct = quote.discount_pct ?? 0;
  const addons = quote.addons ?? [];
  const addonsTotal = quote.addons_total ?? addons.reduce((s, a) => s + a.total, 0);

  return (
    <div className={cn("text-sm text-ink-soft", className)}>
      {quote.nightly.length > 0 && (
        <details open={breakdownOpen} className="group mb-4 border-b border-ink-line pb-3">
          <summary className="g-eyebrow flex cursor-pointer items-center justify-between gap-3 rounded-sm py-1 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
            <span>{t("nightlyBreakdown")}</span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-400 ease-out group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="mt-2">
            {quote.nightly.map((night) => (
              <li key={night.date} className="flex items-center justify-between gap-3 py-1 tabular-nums">
                <span className="text-ink-mute">{formatLongDate(night.date, locale)}</span>
                <span dir="ltr" className="text-ink">
                  {tc("omrAmount", { amount: formatOmr(night.rate) })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <dl className={cn("tabular-nums", compact ? "space-y-1.5" : "space-y-2")}>
        <Row label={t("roomSubtotal")} value={quote.room_subtotal} />
        {discount > 0 && <Row label={t("discount", { pct: pct(discountPct) })} value={-discount} accent />}
        {(taxes.service_charge_enabled || quote.service_charge > 0) && (
          <Row label={t("serviceCharge", { pct: pct(taxes.service_charge_pct) })} value={quote.service_charge} muted />
        )}
        {(taxes.tourism_fee_enabled || quote.tourism_fee > 0) && (
          <Row label={t("tourismFee", { pct: pct(taxes.tourism_fee_pct) })} value={quote.tourism_fee} muted />
        )}
        {(taxes.vat_enabled || quote.vat > 0) && <Row label={t("vat", { pct: pct(taxes.vat_pct) })} value={quote.vat} muted />}
        {addons.map((a, i) => (
          <Row
            key={a.key}
            label={ta("priceLine", { name: a.name, qty: n(a.quantity) })}
            value={a.total}
            className={i === 0 ? "border-t border-ink-line pt-2" : undefined}
            testId="price-addon"
          />
        ))}
        {addons.length > 0 && <Row label={ta("subtotal")} value={addonsTotal} muted testId="price-addons-subtotal" />}
        <div className={cn("flex items-baseline justify-between gap-4 border-t border-ink-line", compact ? "mt-3 pt-3" : "mt-4 pt-4")}>
          <dt className="font-semibold text-ink">{t("total")}</dt>
          <dd dir="ltr" className={cn("g-price shrink-0 text-xl", !compact && "sm:text-2xl")}>
            {tc("omrAmount", { amount: formatOmr(quote.total) })}
          </dd>
        </div>
      </dl>
      {!compact && <p className="g-small mt-2 text-xs">{addons.length > 0 ? ta("totalHint") : t("totalHint")}</p>}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  accent,
  className,
  testId,
}: {
  label: string;
  value: number;
  muted?: boolean;
  accent?: boolean;
  className?: string;
  testId?: string;
}) {
  const tc = useTranslations("common");
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)} data-testid={testId}>
      <dt className={cn(muted ? "text-ink-mute" : "text-ink-soft", accent && "text-jabal-700")}>{label}</dt>
      <dd dir="ltr" className={cn("shrink-0 text-ink", accent && "text-jabal-700")}>
        {value < 0 ? `− ${tc("omrAmount", { amount: formatOmr(Math.abs(value)) })}` : tc("omrAmount", { amount: formatOmr(value) })}
      </dd>
    </div>
  );
}
