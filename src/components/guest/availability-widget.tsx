"use client";

import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { addDays, nightsBetween } from "@/lib/booking-engine/pricing";
import { muscatToday } from "@/lib/booking-engine/dates";
import { cn } from "@/lib/utils";
import { MAX_ADULTS, MAX_CHILDREN, searchParamsFor, type SearchQuery } from "./schemas";
import { n } from "./lib";

// The booking bar: four fields on one line (stacked on phones) and one
// button. On the home page it floats over the foot of the hero ("hero");
// elsewhere it sits inside the page ("panel"); in a narrow sidebar the
// fields stack two by two with a full-width button ("stack").

export interface AvailabilityWidgetProps {
  /** Muscat "today" computed on the server so SSR and hydration agree. */
  today: string;
  maxNights: number;
  maxAdvanceDays: number;
  checkInTime: string;
  checkOutTime: string;
  initial?: Partial<SearchQuery>;
  /** When set, the search goes straight to /book/[slug]. */
  roomSlug?: string;
  roomName?: string;
  variant?: "hero" | "panel" | "stack";
  id?: string;
  onSubmitted?: () => void;
  autoFocus?: boolean;
}

export function AvailabilityWidget({
  today: serverToday,
  maxNights,
  maxAdvanceDays,
  checkInTime,
  checkOutTime,
  initial,
  roomSlug,
  roomName,
  variant = "hero",
  id = "availability",
  onSubmitted,
  autoFocus,
}: AvailabilityWidgetProps) {
  const t = useTranslations("widget");
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();

  // The server value keeps SSR and hydration identical; pages may be cached
  // (ISR), so after mount we re-derive "today" in hotel time on the client.
  const [today, setToday] = useState(serverToday);
  const [checkIn, setCheckIn] = useState(initial?.checkin && initial.checkin >= serverToday ? initial.checkin : serverToday);
  const [checkOut, setCheckOut] = useState(() => {
    const ci = initial?.checkin && initial.checkin >= serverToday ? initial.checkin : serverToday;
    return initial?.checkout && initial.checkout > ci ? initial.checkout : addDays(ci, 1);
  });
  useEffect(() => {
    const now = muscatToday();
    if (now === serverToday) return;
    setToday(now);
    if (checkIn < now) {
      setCheckIn(now);
      if (checkOut <= now) setCheckOut(addDays(now, 1));
    }
  }, [serverToday, checkIn, checkOut]);
  const [adults, setAdults] = useState(initial?.adults ?? 2);
  const [children, setChildren] = useState(initial?.children ?? 0);

  const maxCheckIn = addDays(today, maxAdvanceDays);
  const minCheckOut = addDays(checkIn, 1);
  const maxCheckOut = addDays(checkIn, maxNights);
  const nights = nightsBetween(checkIn, checkOut);

  function onCheckInChange(value: string) {
    if (!value) return;
    const ci = value < today ? today : value > maxCheckIn ? maxCheckIn : value;
    setCheckIn(ci);
    // Keep the same length of stay when possible, else at least one night.
    const keep = Math.min(Math.max(nights, 1), maxNights);
    setCheckOut(addDays(ci, keep));
  }

  function onCheckOutChange(value: string) {
    if (!value) return;
    if (value <= checkIn) setCheckOut(minCheckOut);
    else if (value > maxCheckOut) setCheckOut(maxCheckOut);
    else setCheckOut(value);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const query = searchParamsFor({ checkin: checkIn, checkout: checkOut, adults, children });
    startTransition(() => {
      router.push({ pathname: roomSlug ? `/book/${roomSlug}` : "/book", query });
      onSubmitted?.();
    });
  }

  const hero = variant === "hero";
  const stack = variant === "stack";
  const cell = stack ? "flex flex-col gap-1 px-4 py-3" : "flex flex-col gap-1 px-4 py-3 sm:px-5 sm:py-4";
  const fieldLabel = "g-eyebrow text-[10px] text-ink-mute";
  const field =
    "h-9 w-full border-0 bg-transparent p-0 font-display text-[1.35rem] leading-none text-ink tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 rounded-sm rtl:font-display-ar";

  return (
    <form
      id={id}
      onSubmit={submit}
      aria-labelledby={`${uid}-title`}
      className={cn("bg-white text-ink", hero ? "rounded-[4px] shadow-float" : "g-card")}
    >
      <h2 id={`${uid}-title`} className="sr-only">
        {roomName ? t("forRoom", { name: roomName }) : t("title")}
      </h2>

      <div
        className={cn(
          "grid grid-cols-2 divide-ink-line",
          !stack && "md:grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_auto] md:divide-x rtl:md:divide-x-reverse"
        )}
      >
        <div className={cn(cell, "border-b border-ink-line", !stack && "md:border-b-0")}>
          <label htmlFor={`${uid}-in`} className={fieldLabel}>
            {t("checkIn")}
          </label>
          <input
            id={`${uid}-in`}
            type="date"
            required
            autoFocus={autoFocus}
            value={checkIn}
            min={today}
            max={maxCheckIn}
            onChange={(e) => onCheckInChange(e.target.value)}
            className={field}
          />
        </div>
        <div className={cn(cell, "border-b border-s border-ink-line", !stack && "md:border-b-0 md:border-s-0")}>
          <label htmlFor={`${uid}-out`} className={fieldLabel}>
            {t("checkOut")}
          </label>
          <input
            id={`${uid}-out`}
            type="date"
            required
            value={checkOut}
            min={minCheckOut}
            max={maxCheckOut}
            onChange={(e) => onCheckOutChange(e.target.value)}
            className={field}
          />
        </div>
        <div className={cell}>
          <label htmlFor={`${uid}-adults`} className={fieldLabel}>
            {t("adults")}
          </label>
          <select id={`${uid}-adults`} value={adults} onChange={(e) => setAdults(parseInt(e.target.value, 10))} className={cn(field, "cursor-pointer appearance-none")}>
            {Array.from({ length: MAX_ADULTS }, (_, i) => i + 1).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className={cn(cell, "border-s border-ink-line", !stack && "md:border-s-0")}>
          <label htmlFor={`${uid}-children`} className={fieldLabel}>
            {t("children")}
          </label>
          <select id={`${uid}-children`} value={children} onChange={(e) => setChildren(parseInt(e.target.value, 10))} className={cn(field, "cursor-pointer appearance-none")}>
            {Array.from({ length: MAX_CHILDREN + 1 }, (_, i) => i).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className={cn("col-span-2 flex items-stretch border-t border-ink-line p-2", !stack && "md:col-span-1 md:border-t-0")}>
          <button type="submit" disabled={pending} className={cn("g-btn-primary h-full min-h-12 w-full", !stack && "md:min-w-[11rem]")}>
            <span>{pending ? t("searching") : t("search")}</span>
            <ArrowRight className="g-btn-arrow" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="flex min-h-9 items-center justify-between gap-4 border-t border-ink-line px-4 text-xs text-ink-mute sm:px-5">
        <span>{nights >= maxNights ? t("maxNights", { n: n(maxNights) }) : t("dateHint", { time: checkInTime, time2: checkOutTime })}</span>
        <span className="shrink-0 tabular-nums" aria-live="polite">
          {t("nights", { count: nights, n: n(nights) })}
        </span>
      </p>
    </form>
  );
}
