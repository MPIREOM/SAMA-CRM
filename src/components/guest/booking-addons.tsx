import { getTranslations } from "next-intl/server";
import { Car, Check, Clock, Sparkles, XCircle } from "lucide-react";
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
    <section className={cn("g-card p-5 sm:p-6", className)} aria-labelledby="booking-addons">
      <h2 id="booking-addons" className="g-h3">
        {t("yourAddons")}
      </h2>
      <p className="mt-1.5 text-sm text-maroon-600">{t("yourAddonsHint")}</p>
      <ul className="mt-4 divide-y divide-stone-200">
        {addons.map((row) => {
          const status = asAddonStatus(row.status);
          const addon = row.addon ? localizeAddon(row.addon, locale) : null;
          const name = addon?.name ?? row.addon_id;
          const isTransfer = addon?.kind === "transfer";
          const Icon = isTransfer ? Car : Sparkles;
          const cancelled = status === "cancelled";
          return (
            <li key={row.id} className={cn("flex gap-4 py-4 first:pt-0 last:pb-0", cancelled && "opacity-60")}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-extrabold text-maroon-900">{t("priceLine", { name, qty: n(Number(row.quantity)) })}</p>
                  <p dir="ltr" className="text-sm font-bold text-maroon-800 tabular-nums">
                    {tc("omrAmount", { amount: formatOmr(Number(row.total_omr)) })}
                  </p>
                </div>
                {addon && (
                  <p className="mt-0.5 text-xs text-maroon-600 tabular-nums" dir="ltr">
                    {tc("omrAmount", { amount: formatRate(Number(row.unit_price_omr)) })} {t(`unit.${addonUnitKey(addon.unit, addon.kind)}`)}
                  </p>
                )}
                {row.note && (
                  <p className="mt-2 text-sm text-maroon-800">
                    <span className="font-semibold">{t("noteLabel")}:</span> {row.note}
                  </p>
                )}
                <p className={cn("mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", statusClass(status))}>
                  <StatusIcon status={status} />
                  {t(`status.${status}`)}
                </p>
                {!cancelled && addon?.slug === TRANSFER_UP_SLUG && (
                  <p className="mt-2 text-sm leading-relaxed text-maroon-800">{t("transferUpInstruction")}</p>
                )}
                {!cancelled && addon?.slug === TRANSFER_DOWN_SLUG && (
                  <p className="mt-2 text-sm leading-relaxed text-maroon-800">{t("transferDownInstruction")}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-maroon-600">{t("paidAtHotel")}</p>
    </section>
  );
}

function statusClass(status: ReturnType<typeof asAddonStatus>): string {
  switch (status) {
    case "confirmed":
    case "done":
      return "bg-jabal-50 text-jabal-800";
    case "cancelled":
      return "bg-stone-200 text-maroon-700";
    default:
      return "bg-gold-100 text-maroon-800";
  }
}

function StatusIcon({ status }: { status: ReturnType<typeof asAddonStatus> }) {
  if (status === "confirmed" || status === "done") return <Check className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "cancelled") return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Clock className="h-3.5 w-3.5" aria-hidden="true" />;
}
