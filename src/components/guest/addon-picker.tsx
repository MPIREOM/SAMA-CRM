"use client";

import Image from "next/image";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { formatOmr } from "@/lib/booking-engine/pricing";
import { cn } from "@/lib/utils";
import { addonUnitKey, formatRate, n, type LocalizedAddon } from "./lib";
import { ADDON_NOTE_MAX, addonFieldName } from "./schemas";

// "Add to your stay" — one card per active add-on with a − / + quantity
// stepper and, once something is selected, a short note field (preferred
// day, arrival time …). The parent owns the state and re-quotes on change;
// hidden inputs carry the selection into the server action.

export interface AddonChoice {
  quantity: number;
  note: string;
}

export type AddonSelectionMap = Record<string, AddonChoice>;

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
      <h3 id={`${uid}-title`} className="g-h3 text-lg">
        {t("pickerTitle")}
      </h3>
      <p className="mt-1 text-sm text-maroon-600">{t("pickerHint")}</p>
      <ul className="mt-4 space-y-3">
        {addons.map((addon) => {
          const choice = selection[addon.slug] ?? { quantity: 0, note: "" };
          const selected = choice.quantity > 0;
          const noteId = `${uid}-${addon.slug}-note`;
          const qtyId = `${uid}-${addon.slug}-qty`;
          const noteError = errors?.[addon.slug];
          return (
            <li
              key={addon.slug}
              className={cn(
                "rounded-2xl border bg-white p-4 transition-colors sm:p-5",
                selected ? "border-gold-500 shadow-card" : "border-stone-200"
              )}
            >
              <div className="flex gap-4">
                <div className="relative hidden h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100 sm:block">
                  <Image src={addon.image} alt="" fill sizes="96px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <p id={`${uid}-${addon.slug}-name`} className="text-base font-extrabold text-maroon-900">
                      {addon.name}
                    </p>
                    <p className="text-sm font-bold text-maroon-800 tabular-nums" dir="ltr">
                      {tc("omrAmount", { amount: formatRate(addon.price) })}{" "}
                      <span className="font-normal text-maroon-600">{t(`unit.${addonUnitKey(addon.unit, addon.kind)}`)}</span>
                    </p>
                  </div>
                  {addon.tagline && <p className="mt-1 text-sm leading-relaxed text-maroon-700">{addon.tagline}</p>}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-maroon-600">{t("maxQuantity", { n: n(addon.maxQuantity) })}</span>
                    <div
                      role="group"
                      aria-labelledby={`${uid}-${addon.slug}-name`}
                      className="inline-flex items-center rounded-full border border-stone-300 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => onChange(addon.slug, { ...choice, quantity: Math.max(0, choice.quantity - 1) })}
                        disabled={choice.quantity <= 0}
                        aria-label={t("decrease", { name: addon.name })}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-maroon-800 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-40"
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <output
                        id={qtyId}
                        aria-live="polite"
                        aria-label={t("quantityLabel", { name: addon.name })}
                        className="w-10 text-center text-base font-extrabold text-maroon-900 tabular-nums"
                      >
                        {choice.quantity}
                      </output>
                      <button
                        type="button"
                        onClick={() => onChange(addon.slug, { ...choice, quantity: Math.min(addon.maxQuantity, choice.quantity + 1) })}
                        disabled={choice.quantity >= addon.maxQuantity}
                        aria-label={t("increase", { name: addon.name })}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-maroon-800 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {selected && (
                    <p className="mt-2 text-sm font-semibold text-jabal-700 tabular-nums" dir="ltr">
                      {t("lineTotal", { qty: n(choice.quantity), amount: formatOmr(addon.price * choice.quantity) })}
                    </p>
                  )}

                  {selected && addon.requiresNote && (
                    <div className="mt-3">
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
      <p className="mt-3 text-xs text-maroon-600">{t("pickerFootnote")}</p>
    </section>
  );
}
