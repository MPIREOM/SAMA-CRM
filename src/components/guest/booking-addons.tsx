import { getTranslations } from "next-intl/server";
import { Check, Clock, XCircle } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { formatOmr } from "@/lib/booking-engine/pricing";
import { cn } from "@/lib/utils";
import {
  TRANSFER_DOWN_SLUG,
  TRANSFER_UP_SLUG,
  addonUnitKey,
  asAddonStatus,
  formatRate,
  localizeAddon,
  n,
  type BookingAddonRow,
} from "./lib";

// "Your add-ons" on the confirmation and manage pages: what was requested,
// how many, the guest's note and where the request stands. Transfers restate
// the checkpoint instruction so nobody drives a 2WD up the mountain.

export async function BookingAddons({ addons, locale, className }: { addons: BookingAddonRow[]; locale: Locale; className?: string }) {
  const [t, tc] = await Promise.all([getTranslations("addons"), getTranslations("common")]);
  if (addons.length === 0) return null;

  return (
    <section className={cn("g-card p-6 sm:p-8", className)} aria-labelledby="booking-addons">
      <h2 id="booking-addons" className="g-h3">
        {t("yourAddons")}
      </h2>
      <p className="g-body mt-2 text-[15px]">{t("yourAddonsHint")}</p>
      <ul className="mt-6 border-b border-ink-line">
        {addons.map((row) => {
          const status = asAddonStatus(row.status);
          const addon = row.addon ? localizeAddon(row.addon, locale) : null;
          const name = addon?.name ?? row.addon_id;
          const cancelled = status === "cancelled";
          return (
            <li key={row.id} className={cn("border-t border-ink-line py-5", cancelled && "opacity-60")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="font-semibold text-ink">{t("priceLine", { name, qty: n(Number(row.quantity)) })}</p>
                <p dir="ltr" className="g-price text-lg">
                  {tc("omrAmount", { amount: formatOmr(Number(row.total_omr)) })}
                </p>
              </div>
              {addon && (
                <p className="g-small mt-0.5 text-xs tabular-nums" dir="ltr">
                  {tc("omrAmount", { amount: formatRate(Number(row.unit_price_omr)) })} {t(`unit.${addonUnitKey(addon.unit, addon.kind)}`)}
                </p>
              )}
              {row.note && (
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  <span className="font-semibold text-ink">{t("noteLabel")}:</span> {row.note}
                </p>
              )}
              <p className={cn("mt-3 inline-flex items-center gap-1.5 text-xs font-semibold", statusClass(status))}>
                <StatusIcon status={status} />
                {t(`status.${status}`)}
              </p>
              {!cancelled && addon?.slug === TRANSFER_UP_SLUG && <p className="g-body mt-3 text-[15px]">{t("transferUpInstruction")}</p>}
              {!cancelled && addon?.slug === TRANSFER_DOWN_SLUG && <p className="g-body mt-3 text-[15px]">{t("transferDownInstruction")}</p>}
            </li>
          );
        })}
      </ul>
      <p className="g-small mt-4 text-xs">{t("paidAtHotel")}</p>
    </section>
  );
}

function statusClass(status: ReturnType<typeof asAddonStatus>): string {
  switch (status) {
    case "confirmed":
    case "done":
      return "text-jabal-800";
    case "cancelled":
      return "text-ink-mute";
    default:
      return "text-gold-700";
  }
}

function StatusIcon({ status }: { status: ReturnType<typeof asAddonStatus> }) {
  if (status === "confirmed" || status === "done") return <Check className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "cancelled") return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Clock className="h-3.5 w-3.5" aria-hidden="true" />;
}
