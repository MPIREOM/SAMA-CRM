// Hotel-time helpers. Sama Hotel runs on Asia/Muscat (UTC+4, no DST).
// Dates for check-in/check-out are plain YYYY-MM-DD strings; only message
// send times and "today" need a real instant.

export const HOTEL_TZ = "Asia/Muscat";
const MUSCAT_OFFSET_MS = 4 * 3600 * 1000;

/** Today's date in Muscat as YYYY-MM-DD. */
export function muscatToday(now: Date = new Date()): string {
  return new Date(now.getTime() + MUSCAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` + `HH:MM` in Muscat → UTC instant. */
export function muscatDateTime(date: string, time: string): Date {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  const utc = Date.UTC(
    parseInt(date.slice(0, 4), 10),
    parseInt(date.slice(5, 7), 10) - 1,
    parseInt(date.slice(8, 10), 10),
    h,
    m
  );
  return new Date(utc - MUSCAT_OFFSET_MS);
}

export interface MessagingSchedule {
  pre_arrival_days_before: number;
  pre_arrival_time: string; // HH:MM
  post_stay_days_after: number;
  post_stay_time: string; // HH:MM
}

export const DEFAULT_SCHEDULE: MessagingSchedule = {
  pre_arrival_days_before: 3,
  pre_arrival_time: "10:00",
  post_stay_days_after: 1,
  post_stay_time: "11:00",
};

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * When a scheduled message should go out — mirrors SQL bk_send_at():
 *  confirmation → now
 *  pre_arrival  → (check_in − N days) at HH:MM Muscat; if already past, now + 3 min
 *  post_stay    → (check_out + N days) at HH:MM Muscat
 */
export function computeSendAt(
  kind: "confirmation" | "pre_arrival" | "post_stay",
  checkIn: string,
  checkOut: string,
  schedule: MessagingSchedule = DEFAULT_SCHEDULE,
  now: Date = new Date()
): Date {
  if (kind === "confirmation") return now;
  if (kind === "pre_arrival") {
    const at = muscatDateTime(
      addDaysStr(checkIn, -schedule.pre_arrival_days_before),
      schedule.pre_arrival_time
    );
    return at.getTime() < now.getTime() ? new Date(now.getTime() + 3 * 60_000) : at;
  }
  return muscatDateTime(
    addDaysStr(checkOut, schedule.post_stay_days_after),
    schedule.post_stay_time
  );
}

/** Retry backoff for the dispatcher: attempt 1 → +5 min, 2 → +30 min, 3 → +3 h, then give up. */
export const BACKOFF_MINUTES = [5, 30, 180] as const;
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

export function nextRetryAt(attemptsSoFar: number, now: Date = new Date()): Date | null {
  if (attemptsSoFar >= MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + BACKOFF_MINUTES[attemptsSoFar] * 60_000);
}

/** Hours between now and check-in 14:00 (or the configured time) in Muscat. */
export function hoursUntilCheckIn(
  checkIn: string,
  checkInTime = "14:00",
  now: Date = new Date()
): number {
  return (muscatDateTime(checkIn, checkInTime).getTime() - now.getTime()) / 3_600_000;
}

/** Long date for guest-facing messages: "Fri, 12 Sep 2026" / Arabic equivalent. */
export function formatLongDate(dateStr: string, locale: "en" | "ar"): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(d);
}
