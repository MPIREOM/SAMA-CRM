"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import type { CancelState } from "@/app/[locale]/(guest)/booking/[ref]/manage/actions";
import { cn } from "@/lib/utils";
import { prettyPhone, telLink, waLink } from "./lib";

// "Request cancellation" with a confirmation dialog. The server action
// re-verifies the token and the deadline before cancelling.

const INITIAL: CancelState = { status: "idle" };
/** Fade-out before the dialog unmounts; keep in sync with .g-leaving in globals.css. */
const LEAVE_MS = 300;

export function ManageBooking({
  bookingRef,
  token,
  datesLabel,
  canCancel,
  alreadyCancelled,
  deadlineLabel,
  hoursBefore,
  whatsapp,
  phone,
  hasAddons = false,
  action,
}: {
  bookingRef: string;
  token: string;
  datesLabel: string;
  canCancel: boolean;
  alreadyCancelled: boolean;
  deadlineLabel: string | null;
  hoursBefore: number;
  whatsapp: string;
  phone: string;
  /** Add-ons (zipline, transfers) are cancelled together with the room. */
  hasAddons?: boolean;
  action: (prev: CancelState, formData: FormData) => Promise<CancelState>;
}) {
  const t = useTranslations("manage");
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const [state, formAction] = useFormState(action, INITIAL);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelled = alreadyCancelled || state.status === "cancelled";

  // Dismissing fades the dialog out first (reduced motion: straight away).
  const close = useCallback(() => {
    if (leaveTimer.current !== undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOpen(false);
      return;
    }
    setLeaving(true);
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = undefined;
      setLeaving(false);
      setOpen(false);
    }, LEAVE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    if (state.status === "cancelled") setOpen(false);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("textarea, button")?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const contactRow = (
    <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-4">
      <a href={waLink(whatsapp, t("subtitle", { ref: bookingRef }))} target="_blank" rel="noopener noreferrer" className="g-link">
        {t("contactUs")}
        <ArrowUpRight className="g-arrow-ext h-3.5 w-3.5" aria-hidden="true" />
      </a>
      <a href={telLink(phone)} className="g-link" dir="ltr">
        {prettyPhone(phone)}
      </a>
    </div>
  );

  if (cancelled) {
    return (
      <div className="g-card g-enter p-6 sm:p-8" role="status">
        <h2 className="g-h3">{t("cancelledTitle")}</h2>
        <p className="g-body mt-3 text-[15px]">{t("cancelledBody", { ref: bookingRef })}</p>
      </div>
    );
  }

  if (!canCancel) {
    return (
      <div className="g-card p-6 sm:p-8">
        <h2 className="g-h3">{deadlineLabel ? t("tooLateTitle") : t("notCancellableTitle")}</h2>
        <p className="g-body mt-3 max-w-2xl text-[15px]">{deadlineLabel ? t("tooLateBody", { hours: String(hoursBefore) }) : t("notCancellableBody")}</p>
        {contactRow}
      </div>
    );
  }

  return (
    <div className="g-card p-6 sm:p-8">
      {state.status === "error" && (
        <p role="alert" className="g-note-red mb-6">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {deadlineLabel && (
        <p className="g-note-green flex items-center gap-2.5">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("freeUntil", { date: deadlineLabel })}</span>
        </p>
      )}
      <div className="mt-6">
        <button type="button" onClick={() => setOpen(true)} className="g-btn-outline border-crimson-300 text-crimson-800 hover:border-crimson-700 hover:bg-crimson-700 hover:text-white">
          {t("requestCancel")}
        </button>
      </div>
      {contactRow}

      {open && (
        <div className={cn("fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center", leaving && "g-leaving")}>
          <button
            type="button"
            aria-label={t("keepBooking")}
            onClick={close}
            className="g-backdrop absolute inset-0 bg-ink/70 backdrop-blur-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${uid}-title`}
            aria-describedby={`${uid}-body`}
            className="g-card g-fade-up relative z-10 w-full max-w-md p-6 shadow-float sm:p-8"
          >
            <h2 id={`${uid}-title`} className="g-h3">
              {t("cancelTitle")}
            </h2>
            <p id={`${uid}-body`} className="g-body mt-3 text-[15px]">
              {t("cancelBody", { dates: datesLabel })}
              {hasAddons && <span className="mt-2 block">{t("cancelAddonsNote")}</span>}
            </p>
            <form action={formAction} className="mt-6">
              <input type="hidden" name="ref" value={bookingRef} />
              <input type="hidden" name="token" value={token} />
              <label htmlFor={`${uid}-reason`} className="g-label">
                {t("reason")}
              </label>
              <textarea id={`${uid}-reason`} name="reason" rows={2} maxLength={300} placeholder={t("reasonPlaceholder")} className="g-textarea min-h-20" />
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={close} className="g-btn-ghost">
                  {t("keepBooking")}
                </button>
                <SubmitButton label={t("confirmCancel")} pendingLabel={t("cancelling")} />
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-live="polite" className="g-btn-danger">
      {/* Both labels share one grid cell, so the button keeps its width while pending. */}
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", pending && "invisible")}>{label}</span>
        <span className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-2.5", !pending && "invisible")}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </span>
      </span>
    </button>
  );
}
