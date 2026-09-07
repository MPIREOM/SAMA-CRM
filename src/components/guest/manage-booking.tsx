"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2, MessageCircle, Phone, XCircle } from "lucide-react";
import type { CancelState } from "@/app/[locale]/(guest)/booking/[ref]/manage/actions";
import { prettyPhone, telLink, waLink } from "./lib";

// "Request cancellation" with a confirmation dialog. The server action
// re-verifies the token and the deadline before cancelling.

const INITIAL: CancelState = { status: "idle" };

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
  action: (prev: CancelState, formData: FormData) => Promise<CancelState>;
}) {
  const t = useTranslations("manage");
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(action, INITIAL);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelled = alreadyCancelled || state.status === "cancelled";

  useEffect(() => {
    if (state.status === "cancelled") setOpen(false);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("textarea, button")?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const contactRow = (
    <div className="mt-4 flex flex-wrap gap-3">
      <a href={waLink(whatsapp, t("subtitle", { ref: bookingRef }))} target="_blank" rel="noopener noreferrer" className="g-btn-outline g-btn-sm">
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {t("contactUs")}
      </a>
      <a href={telLink(phone)} className="g-btn-outline g-btn-sm" dir="ltr">
        <Phone className="h-4 w-4" aria-hidden="true" />
        {prettyPhone(phone)}
      </a>
    </div>
  );

  if (cancelled) {
    return (
      <div className="g-card flex items-start gap-4 p-5 sm:p-6" role="status">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-200 text-maroon-700">
          <XCircle className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="g-h3">{t("cancelledTitle")}</h2>
          <p className="mt-1.5 text-sm text-maroon-800">{t("cancelledBody", { ref: bookingRef })}</p>
        </div>
      </div>
    );
  }

  if (!canCancel) {
    return (
      <div className="g-card p-5 sm:p-6">
        <h2 className="g-h3">{deadlineLabel ? t("tooLateTitle") : t("notCancellableTitle")}</h2>
        <p className="mt-1.5 text-sm text-maroon-800">{deadlineLabel ? t("tooLateBody", { hours: String(hoursBefore) }) : t("notCancellableBody")}</p>
        {contactRow}
      </div>
    );
  }

  return (
    <div className="g-card p-5 sm:p-6">
      {state.status === "error" && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-crimson-200 bg-crimson-50 px-4 py-3 text-sm font-semibold text-crimson-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`errors.${state.error}`)}
        </p>
      )}
      {deadlineLabel && (
        <p className="inline-flex items-center gap-2 rounded-full bg-jabal-50 px-3.5 py-1.5 text-xs font-bold text-jabal-800">
          <Check className="h-4 w-4" aria-hidden="true" />
          {t("freeUntil", { date: deadlineLabel })}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => setOpen(true)} className="g-btn-outline border-crimson-300 text-crimson-800 hover:border-crimson-600 hover:bg-crimson-50">
          {t("requestCancel")}
        </button>
      </div>
      {contactRow}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button type="button" aria-label={t("keepBooking")} onClick={() => setOpen(false)} className="absolute inset-0 bg-maroon-950/60 backdrop-blur-sm" />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${uid}-title`}
            aria-describedby={`${uid}-body`}
            className="relative z-10 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <h2 id={`${uid}-title`} className="g-h3">
              {t("cancelTitle")}
            </h2>
            <p id={`${uid}-body`} className="mt-2 text-sm leading-relaxed text-maroon-800">
              {t("cancelBody", { dates: datesLabel })}
            </p>
            <form action={formAction} className="mt-5">
              <input type="hidden" name="ref" value={bookingRef} />
              <input type="hidden" name="token" value={token} />
              <label htmlFor={`${uid}-reason`} className="g-label">
                {t("reason")}
              </label>
              <textarea id={`${uid}-reason`} name="reason" rows={2} maxLength={300} placeholder={t("reasonPlaceholder")} className="g-textarea min-h-20" />
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setOpen(false)} className="g-btn-ghost">
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
    <button type="submit" disabled={pending} className="g-btn bg-crimson-700 text-white hover:bg-crimson-600">
      {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <XCircle className="h-5 w-5" aria-hidden="true" />}
      {pending ? pendingLabel : label}
    </button>
  );
}
