"use client";

import Image from "next/image";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { formatOmr } from "@/lib/booking-engine/pricing";
import { cn } from "@/lib/utils";
import { addonUnitKey, formatRate, n, type LocalizedAddon } from "./lib";
import { ADDON_NOTE_MAX, addonFieldName } from "./schemas";

// "Add to your stay" — one hairline row per active add-on with a − / +
// quantity stepper and, once something is selected, a short note field
// (preferred day, arrival time …). The parent owns the state and re-quotes on
// change; hidden inputs carry the selection into the server action.

export interface AddonChoice {
  quantity: number;
  note: string;
}

export type AddonSelectionMap = Record<string, AddonChoice>;

const stepBtn =
  "g-press g-focus-inset flex h-11 w-11 items-center justify-center text-ink hover:bg-paper-200 active:bg-paper-300 disabled:pointer-events-none disabled:opacity-30";

export function AddonPicker({
  addons,
  selection,
  onChange,
  errors,
}: {
  addons: LocalizedAddon[];
  selection: AddonSelectionMap;
  onChange: (slug: string, choice: AddonChoice) => void;
  errors?: Record<string, string>;
}) {
  const t = useTranslations("addons");
  const tc = useTranslations("common");
  const uid = useId();
  if (addons.length === 0) return null;

  return (
    <section aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="g-h4">
        {t("pickerTitle")}
      </h3>
      <p className="g-body mt-2">{t("pickerHint")}</p>
      <ul className="mt-6 border-b border-ink-line">
        {addons.map((addon) => {
          const choice = selection[addon.slug] ?? { quantity: 0, note: "" };
          const selected = choice.quantity > 0;
          const noteId = `${uid}-${addon.slug}-note`;
          const qtyId = `${uid}-${addon.slug}-qty`;
          const noteError = errors?.[addon.slug];
          return (
            <li key={addon.slug} className="relative border-t border-ink-line py-6">
              {/* A gold bar draws in the margin once something is picked; the row itself never reflows. */}
              <span aria-hidden="true" className={cn("g-select-bar", selected && "is-on")} />
              <div className="flex gap-5">
                <div className="g-frame hidden h-20 w-24 shrink-0 sm:block">
                  <Image src={addon.image} alt="" fill sizes="96px" className={cn("object-cover transition-[filter] duration-600", !selected && "saturate-[0.85]")} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <p id={`${uid}-${addon.slug}-name`} className="g-h4">
                      {addon.name}
                    </p>
                    <p className="shrink-0 whitespace-nowrap" dir="ltr">
                      <span className="g-price text-lg">{tc("omrAmount", { amount: formatRate(addon.price) })}</span>{" "}
                      <span className="g-small">{t(`unit.${addonUnitKey(addon.unit, addon.kind)}`)}</span>
                    </p>
                  </div>
                  {addon.tagline && <p className="g-body mt-2">{addon.tagline}</p>}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="g-small" aria-live="polite">
                      {selected ? (
                        <span className="text-ink tabular-nums" dir="ltr">
                          {t("lineTotal", { qty: n(choice.quantity), amount: formatOmr(addon.price * choice.quantity) })}
                        </span>
                      ) : (
                        t("maxQuantity", { n: n(addon.maxQuantity) })
                      )}
                    </p>
                    <div role="group" aria-labelledby={`${uid}-${addon.slug}-name`} className="inline-flex items-center overflow-hidden rounded-[3px] border border-ink/25 bg-white" dir="ltr">
                      <button
                        type="button"
                        onClick={() => onChange(addon.slug, { ...choice, quantity: Math.max(0, choice.quantity - 1) })}
                        disabled={choice.quantity <= 0}
                        aria-label={t("decrease", { name: addon.name })}
                        className={stepBtn}
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <output
                        id={qtyId}
                        aria-live="polite"
                        aria-label={t("quantityLabel", { name: addon.name })}
                        className="w-11 border-x border-ink-line text-center text-base font-semibold leading-[2.75rem] text-ink tabular-nums"
                      >
                        {choice.quantity}
                      </output>
                      <button
                        type="button"
                        onClick={() => onChange(addon.slug, { ...choice, quantity: Math.min(addon.maxQuantity, choice.quantity + 1) })}
                        disabled={choice.quantity >= addon.maxQuantity}
                        aria-label={t("increase", { name: addon.name })}
                        className={stepBtn}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* The note field unfolds (.g-collapse) once something is picked; closed, it is out of the tab order.
                      The 4px inset keeps the input's focus ring clear of the clipping wrapper. */}
                  {addon.requiresNote && (
                    <div className={cn("g-collapse -mx-1", selected && "is-open")}>
                      <div className="px-1">
                        <div className="mt-5">
                          <label htmlFor={noteId} className="g-label">
                            {t("noteLabel")}
                          </label>
                          <input
                            id={noteId}
                            type="text"
                            maxLength={ADDON_NOTE_MAX}
                            value={choice.note}
                            onChange={(e) => onChange(addon.slug, { ...choice, note: e.target.value })}
                            autoComplete="off"
                            aria-describedby={`${noteId}-hint`}
                            aria-invalid={!!noteError}
                            className="g-input"
                          />
                          {noteError ? (
                            <p className="g-error" role="alert">
                              {noteError}
                            </p>
                          ) : (
                            <p id={`${noteId}-hint`} className="g-hint">
                              {addon.noteHint || t("noteHint")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* The selection travels with the form as hidden fields (see addonsFromFormData). */}
              {selected && (
                <>
                  <input type="hidden" name={addonFieldName(addon.slug, "quantity")} value={choice.quantity} />
                  <input type="hidden" name={addonFieldName(addon.slug, "note")} value={choice.note} />
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="g-small mt-4 text-xs">{t("pickerFootnote")}</p>
    </section>
  );
}
