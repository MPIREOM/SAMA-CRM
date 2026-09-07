"use client";

import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { addDays, nightsBetween } from "@/lib/booking-engine/pricing";
import { muscatToday } from "@/lib/booking-engine/dates";
import { cn } from "@/lib/utils";
import { MAX_ADULTS, MAX_CHILDREN, searchParamsFor, type SearchQuery } from "./schemas";
import { n } from "./lib";

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
  variant?: "hero" | "panel";
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
  const fieldLabel = "mb-1 block text-xs font-bold uppercase tracking-wider text-maroon-700 rtl:text-sm rtl:tracking-normal";

  return (
    <form
      id={id}
      onSubmit={submit}
      aria-labelledby={`${uid}-title`}
      className={cn(
        "g-card p-4 sm:p-5",
        hero ? "shadow-[0_20px_60px_-20px_rgba(59,23,27,0.45)]" : "shadow-card"
      )}
    >
      <div className="mb-3 flex min-h-6 items-baseline justify-between gap-3">
        <h2 id={`${uid}-title`} className="text-base font-extrabold text-maroon-900">
          {roomName ? t("forRoom", { name: roomName }) : t("title")}
        </h2>
        <p className="text-sm font-semibold text-maroon-700 tabular-nums" aria-live="polite">
          {t("nights", { count: nights, n: n(nights) })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_0.8fr_0.8fr_auto]">
        <div>
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
            className="g-input tabular-nums"
          />
        </div>
        <div>
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
            className="g-input tabular-nums"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-adults`} className={fieldLabel}>
            {t("adults")}
          </label>
          <select
            id={`${uid}-adults`}
            value={adults}
            onChange={(e) => setAdults(parseInt(e.target.value, 10))}
            className="g-select tabular-nums"
          >
            {Array.from({ length: MAX_ADULTS }, (_, i) => i + 1).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-children`} className={fieldLabel}>
            {t("children")}
          </label>
          <select
            id={`${uid}-children`}
            value={children}
            onChange={(e) => setChildren(parseInt(e.target.value, 10))}
            className="g-select tabular-nums"
          >
            {Array.from({ length: MAX_CHILDREN + 1 }, (_, i) => i).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex items-end md:col-span-1">
          <button type="submit" disabled={pending} className="g-btn-primary h-12 w-full md:w-auto md:px-5">
            <Search className="h-5 w-5" aria-hidden="true" />
            <span>{pending ? t("searching") : t("search")}</span>
          </button>
        </div>
      </div>

      <p className="mt-3 min-h-5 text-xs text-maroon-600">
        {nights >= maxNights ? t("maxNights", { n: n(maxNights) }) : t("dateHint", { time: checkInTime, time2: checkOutTime })}
      </p>
    </form>
  );
}
