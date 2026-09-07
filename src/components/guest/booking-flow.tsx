"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, MessageCircle, Wallet } from "lucide-react";
import { Link, type Locale } from "@/i18n/routing";
import { COUNTRY_CODES } from "@/lib/phone";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { nightsBetween, type TaxSettings } from "@/lib/booking-engine/pricing";
import type { QuoteResult } from "@/lib/bk/types";
import { cn } from "@/lib/utils";
import type { CreateBookingState, QuoteState } from "@/app/[locale]/(guest)/book/[slug]/actions";
import { PriceSummary } from "./price-summary";
import { n, waLink, type LocalizedRoom } from "./lib";
import {
  NATIONALITY_CODES,
  fieldErrors,
  guestDetailsSchema,
  searchParamsFor,
  type NationalityCode,
  type SearchQuery,
} from "./schemas";

export interface BookingFlowProps {
  locale: Locale;
  room: LocalizedRoom;
  query: SearchQuery;
  initialQuote: QuoteResult;
  taxes: TaxSettings;
  times: { check_in: string; check_out: string };
  cancellationPolicy: string;
  maxAdvanceDays: number;
  whatsapp: string;
  actions: {
    getQuote: (input: unknown) => Promise<QuoteState>;
    createBooking: (prev: CreateBookingState, formData: FormData) => Promise<CreateBookingState>;
  };
}

type Step = 1 | 2;

interface FormValues {
  fullName: string;
  email: string;
  countryCode: string;
  phone: string;
  nationality: NationalityCode | "";
  otherNationality: string;
  preferredLang: "en" | "ar";
  specialRequests: string;
  promoCode: string;
}

const INITIAL_STATE: CreateBookingState = { error: null };

export function BookingFlow({ locale, room, query, initialQuote, taxes, times, cancellationPolicy, maxAdvanceDays, whatsapp, actions }: BookingFlowProps) {
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const uid = useId();
  const nights = nightsBetween(query.checkin, query.checkout);

  const [step, setStep] = useState<Step>(1);
  const [details, setDetails] = useState<FormValues>({
    fullName: "",
    email: "",
    countryCode: "+968",
    phone: "",
    nationality: "",
    otherNationality: "",
    preferredLang: locale,
    specialRequests: "",
    promoCode: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<QuoteResult>(initialQuote);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, startQuote] = useTransition();
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [state, formAction] = useFormState(actions.createBooking, INITIAL_STATE);
  const topRef = useRef<HTMLDivElement>(null);

  // Server-side validation failures map back onto the form fields.
  useEffect(() => {
    if (state.error === "validation" && state.fields) {
      setErrors(state.fields);
      if (state.fields.consent) setConsentError(true);
      const onlyConsent = Object.keys(state.fields).every((k) => k === "consent");
      if (!onlyConsent) setStep(1);
    }
    if (state.error) topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setDetails((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  }

  function toReview(e: FormEvent) {
    e.preventDefault();
    const parsed = guestDetailsSchema.safeParse(details);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      const first = Object.keys(fe)[0];
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    setErrors({});
    setStep(2);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const promo = parsed.data.promoCode;
    startQuote(async () => {
      const res = await actions.getQuote({
        slug: room.slug,
        checkin: query.checkin,
        checkout: query.checkout,
        adults: query.adults,
        children: query.children,
        promoCode: promo || undefined,
      });
      if (res.error) setQuoteError(res.error);
      else {
        setQuoteError(null);
        setQuote(res.quote);
      }
    });
  }

  const steps = [t("steps.details"), t("steps.review"), t("steps.confirm")];
  const cleanPromo = details.promoCode.trim().toUpperCase();
  const visualStep = submitting ? 3 : step;

  return (
    <div ref={topRef} className="scroll-mt-24">
      <ol className="flex items-center gap-2 text-sm" aria-label={t("stepLabel", { n: n(visualStep) })}>
        {steps.map((label, i) => {
          const num = i + 1;
          const active = num === visualStep;
          const done = num < visualStep;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold tabular-nums",
                  active ? "bg-maroon-800 text-gold-100" : done ? "bg-jabal-600 text-white" : "bg-stone-200 text-maroon-600"
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : num}
              </span>
              <span className={cn("font-semibold", active ? "text-maroon-900" : "text-maroon-600", "hidden sm:inline")}>{label}</span>
              {num < 3 && <span className="mx-1 h-px w-6 bg-stone-300 sm:w-10" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      {state.error && state.error !== "validation" && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-crimson-200 bg-crimson-50 p-4 text-sm text-crimson-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-crimson-700" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t(`errors.${state.error}`, { n: n(maxAdvanceDays) })}</p>
            {(state.error === "sold_out" || state.error === "min_stay" || state.error === "past_date" || state.error === "invalid_dates") && (
              <Link href={{ pathname: "/book", query: searchParamsFor(query) }} className="g-link mt-2 inline-block">
                {t("searchAgain")}
              </Link>
            )}
            {state.error === "unknown" && (
              <a href={waLink(whatsapp)} target="_blank" rel="noopener noreferrer" className="g-link mt-2 inline-flex items-center gap-1">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {tc("whatsapp")}
              </a>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px] lg:gap-12">
        <div>
          {step === 1 && (
            <form onSubmit={toReview} noValidate className="g-card p-5 sm:p-8">
              <h2 className="g-h3">{t("guestDetails")}</h2>
              <p className="mt-1.5 text-sm text-maroon-600">{t("guestDetailsHint")}</p>

              <div className="mt-6 space-y-5">
                <Field id={`${uid}-fullName`} label={t("fullName")} error={errors.fullName && t(`validation.${errors.fullName}`)}>
                  <input
                    id={`${uid}-fullName`}
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    required
                    value={details.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                    placeholder={t("fullNamePlaceholder")}
                    aria-invalid={!!errors.fullName}
                    className="g-input"
                  />
                </Field>

                <Field id={`${uid}-email`} label={t("email")} optional hint={t("emailHint")} error={errors.email && t(`validation.${errors.email}`)}>
                  <input
                    id={`${uid}-email`}
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    dir="ltr"
                    value={details.email}
                    onChange={(e) => update("email", e.target.value)}
                    aria-invalid={!!errors.email}
                    className="g-input text-start"
                  />
                </Field>

                <div>
                  <span className="g-label">{t("phone")}</span>
                  <div className="grid grid-cols-[minmax(7.5rem,2fr)_3fr] gap-2" dir="ltr">
                    <div>
                      <label htmlFor={`${uid}-countryCode`} className="sr-only">
                        {t("countryCode")}
                      </label>
                      <select
                        id={`${uid}-countryCode`}
                        name="countryCode"
                        value={details.countryCode}
                        onChange={(e) => update("countryCode", e.target.value)}
                        className="g-select tabular-nums"
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.iso} value={c.code}>
                            {c.code} {locale === "ar" ? c.ar : c.en}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${uid}-phone`} className="sr-only">
                        {t("phoneNumber")}
                      </label>
                      <input
                        id={`${uid}-phone`}
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        required
                        value={details.phone}
                        onChange={(e) => update("phone", e.target.value)}
                        placeholder={t("phonePlaceholder")}
                        aria-invalid={!!errors.phone}
                        aria-describedby={`${uid}-phone-hint`}
                        className="g-input tabular-nums"
                      />
                    </div>
                  </div>
                  {errors.phone ? (
                    <p className="g-error" role="alert">
                      {t(`validation.${errors.phone}`)}
                    </p>
                  ) : (
                    <p id={`${uid}-phone-hint`} className="g-hint">
                      {t("phoneHint")}
                    </p>
                  )}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id={`${uid}-nationality`} label={t("nationality")} error={errors.nationality && t(`validation.${errors.nationality}`)}>
                    <select
                      id={`${uid}-nationality`}
                      name="nationality"
                      required
                      value={details.nationality}
                      onChange={(e) => update("nationality", e.target.value as NationalityCode | "")}
                      aria-invalid={!!errors.nationality}
                      className="g-select"
                    >
                      <option value="" disabled>
                        {t("nationalityPlaceholder")}
                      </option>
                      {NATIONALITY_CODES.map((code) => (
                        <option key={code} value={code}>
                          {t(`nationalities.${code}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {details.nationality === "OTHER" && (
                    <Field id={`${uid}-otherNationality`} label={t("otherNationality")} error={errors.otherNationality && t(`validation.${errors.otherNationality}`)}>
                      <input
                        id={`${uid}-otherNationality`}
                        name="otherNationality"
                        type="text"
                        autoComplete="country-name"
                        value={details.otherNationality}
                        onChange={(e) => update("otherNationality", e.target.value)}
                        aria-invalid={!!errors.otherNationality}
                        className="g-input"
                      />
                    </Field>
                  )}
                </div>

                <fieldset>
                  <legend className="g-label">{t("preferredLang")}</legend>
                  <div className="flex gap-3">
                    {(["en", "ar"] as const).map((lang) => (
                      <label
                        key={lang}
                        className={cn(
                          "flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors",
                          "focus-within:ring-2 focus-within:ring-gold-400",
                          details.preferredLang === lang ? "border-maroon-800 bg-maroon-800 text-gold-100" : "border-stone-300 bg-white text-maroon-800 hover:bg-stone-50"
                        )}
                      >
                        <input
                          type="radio"
                          name="preferredLang"
                          value={lang}
                          checked={details.preferredLang === lang}
                          onChange={() => update("preferredLang", lang)}
                          className="sr-only"
                        />
                        {lang === "en" ? t("langEn") : t("langAr")}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <Field id={`${uid}-specialRequests`} label={t("specialRequests")} optional hint={t("specialRequestsHint")} error={errors.specialRequests && t(`validation.${errors.specialRequests}`)}>
                  <textarea
                    id={`${uid}-specialRequests`}
                    name="specialRequests"
                    rows={3}
                    maxLength={500}
                    value={details.specialRequests}
                    onChange={(e) => update("specialRequests", e.target.value)}
                    aria-invalid={!!errors.specialRequests}
                    className="g-textarea"
                  />
                </Field>

                <Field id={`${uid}-promoCode`} label={t("promoCode")} optional hint={t("promoHint")}>
                  <input
                    id={`${uid}-promoCode`}
                    name="promoCode"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    dir="ltr"
                    maxLength={30}
                    value={details.promoCode}
                    onChange={(e) => update("promoCode", e.target.value.toUpperCase())}
                    className="g-input max-w-xs uppercase tracking-wider"
                  />
                </Field>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Link href={{ pathname: "/book", query: searchParamsFor(query) }} className="g-btn-ghost">
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  {t("back")}
                </Link>
                <button type="submit" className="g-btn-primary">
                  {t("continue")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form action={formAction} className="g-card p-5 sm:p-8" onSubmit={(e) => {
              if (!consent) {
                e.preventDefault();
                setConsentError(true);
                document.getElementById(`${uid}-consent`)?.focus();
              }
            }}>
              <h2 className="g-h3">{t("reviewTitle")}</h2>
              <p className="mt-1.5 text-sm text-maroon-600">{t("reviewHint")}</p>

              {/* Everything the action needs travels as hidden fields. */}
              <input type="hidden" name="fullName" value={details.fullName} />
              <input type="hidden" name="email" value={details.email} />
              <input type="hidden" name="countryCode" value={details.countryCode} />
              <input type="hidden" name="phone" value={details.phone} />
              <input type="hidden" name="nationality" value={details.nationality} />
              <input type="hidden" name="otherNationality" value={details.otherNationality} />
              <input type="hidden" name="preferredLang" value={details.preferredLang} />
              <input type="hidden" name="specialRequests" value={details.specialRequests} />
              <input type="hidden" name="promoCode" value={cleanPromo} />
              <input type="hidden" name="slug" value={room.slug} />
              <input type="hidden" name="checkin" value={query.checkin} />
              <input type="hidden" name="checkout" value={query.checkout} />
              <input type="hidden" name="adults" value={query.adults} />
              <input type="hidden" name="children" value={query.children} />
              <input type="hidden" name="locale" value={locale} />

              <dl className="mt-6 divide-y divide-stone-200 rounded-2xl border border-stone-200">
                <ReviewRow label={t("guestSummary")}>
                  <span className="font-semibold text-maroon-900">{details.fullName}</span>
                  <span dir="ltr" className="block text-maroon-700">
                    {details.countryCode} {details.phone}
                  </span>
                  {details.email && <span className="block text-maroon-700">{details.email}</span>}
                </ReviewRow>
                <ReviewRow label={t("nationality")}>
                  {details.nationality === "OTHER" ? details.otherNationality : details.nationality ? t(`nationalities.${details.nationality}`) : ""}
                </ReviewRow>
                <ReviewRow label={t("preferredLang")}>{details.preferredLang === "ar" ? t("langAr") : t("langEn")}</ReviewRow>
                {details.specialRequests && <ReviewRow label={t("specialRequests")}>{details.specialRequests}</ReviewRow>}
              </dl>
              <button type="button" onClick={() => setStep(1)} className="g-link mt-3 text-sm">
                {t("editDetails")}
              </button>

              <section className="mt-8" aria-labelledby={`${uid}-price`}>
                <h3 id={`${uid}-price`} className="g-h3 text-lg">
                  {t("priceDetails")}
                </h3>
                <div className="mt-3 min-h-[12rem]" aria-busy={quoting}>
                  {quoting ? (
                    <p className="flex items-center gap-2 text-sm text-maroon-700">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {t("loadingQuote")}
                    </p>
                  ) : (
                    <>
                      {quoteError && (
                        <p role="alert" className="mb-3 text-sm font-semibold text-crimson-700">
                          {t(`errors.${quoteError === "unknown" ? "unknown" : "quote_failed"}`)}
                        </p>
                      )}
                      {cleanPromo && quote.promo_valid && (
                        <p className="mb-3 rounded-xl bg-jabal-50 px-3.5 py-2 text-sm font-semibold text-jabal-800">
                          {t("promoApplied", { code: cleanPromo, pct: n(quote.discount_pct) })}
                        </p>
                      )}
                      {cleanPromo && !quote.promo_valid && !quoteError && (
                        <p className="mb-3 rounded-xl bg-gold-50 px-3.5 py-2 text-sm text-maroon-800">{t("promoInvalid", { code: cleanPromo })}</p>
                      )}
                      <PriceSummary quote={quote} taxes={taxes} locale={locale} breakdownOpen />
                    </>
                  )}
                </div>
              </section>

              <section className="mt-8" aria-labelledby={`${uid}-policy`}>
                <h3 id={`${uid}-policy`} className="g-h3 text-lg">
                  {t("cancellationPolicy")}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-maroon-800">{cancellationPolicy}</p>
              </section>

              <div className="mt-8 flex items-start gap-4 rounded-2xl border-2 border-jabal-600 bg-jabal-50 p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-jabal-600 text-white">
                  <Wallet className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-base font-extrabold text-jabal-900">{t("payAtHotelTitle")}</p>
                  <p className="mt-1 text-sm leading-relaxed text-jabal-900/90">{t("payAtHotelBody")}</p>
                </div>
              </div>

              <div className="mt-6">
                <label htmlFor={`${uid}-consent`} className="flex cursor-pointer items-start gap-3 text-sm text-maroon-800">
                  <input
                    id={`${uid}-consent`}
                    name="consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      if (e.target.checked) setConsentError(false);
                    }}
                    aria-invalid={consentError}
                    aria-describedby={consentError ? `${uid}-consent-error` : undefined}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-stone-400 text-maroon-800 focus:ring-2 focus:ring-gold-400"
                  />
                  <span>
                    {t("consent")}{" "}
                    <Link href="/policies" target="_blank" className="g-link">
                      {t("policiesLink")}
                    </Link>
                  </span>
                </label>
                {consentError && (
                  <p id={`${uid}-consent-error`} role="alert" className="g-error ms-8">
                    {t("validation.consent")}
                  </p>
                )}
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setStep(1)} className="g-btn-ghost">
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  {t("back")}
                </button>
                <ConfirmButton disabled={quoting} label={t("confirm")} pendingLabel={t("confirming")} />
              </div>
              <PendingHint text={t("confirmingHint")} onPendingChange={setSubmitting} />
            </form>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="g-card overflow-hidden">
            <div className="relative aspect-[16/10] bg-stone-100">
              <Image src={room.images[0]} alt={room.name} fill sizes="(min-width: 1024px) 360px, 100vw" className="object-cover" />
            </div>
            <div className="p-5">
              <p className="g-eyebrow">{t("yourStay")}</p>
              <h2 className="g-h3 mt-2">{room.name}</h2>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-maroon-600">{t("dates")}</dt>
                  <dd className="text-end font-semibold text-maroon-900">
                    {formatLongDate(query.checkin, locale)}
                    <span className="block text-xs font-normal text-maroon-600">{t("checkInFrom", { time: times.check_in })}</span>
                    {formatLongDate(query.checkout, locale)}
                    <span className="block text-xs font-normal text-maroon-600">{t("checkOutBy", { time: times.check_out })}</span>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-maroon-600">{t("nights")}</dt>
                  <dd className="font-semibold text-maroon-900">{tc("nights", { count: nights, n: n(nights) })}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-maroon-600">{t("guests")}</dt>
                  <dd className="text-end font-semibold text-maroon-900">
                    {tc("adults", { count: query.adults, n: n(query.adults) })}
                    {query.children > 0 && <span className="block">{tc("children", { count: query.children, n: n(query.children) })}</span>}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-stone-200 pt-4">
                <PriceSummary quote={quote} taxes={taxes} locale={locale} compact />
              </div>
              <Link href={{ pathname: "/book", query: searchParamsFor(query) }} className="g-link mt-4 inline-block text-sm">
                {t("changeDates")}
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string | false;
  children: React.ReactNode;
}) {
  const tc = useTranslations("common");
  return (
    <div>
      <label htmlFor={id} className="g-label">
        {label}
        {optional && <span className="ms-1.5 text-xs font-normal text-maroon-500">({tc("optional")})</span>}
      </label>
      {children}
      {error ? (
        <p className="g-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="g-hint">{hint}</p>
      ) : null}
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-maroon-600">{label}</dt>
      <dd className="text-sm text-maroon-900">{children}</dd>
    </div>
  );
}

function ConfirmButton({ disabled, label, pendingLabel }: { disabled: boolean; label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="g-btn-gold min-w-52" aria-live="polite">
      {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
      {pending ? pendingLabel : label}
    </button>
  );
}

function PendingHint({ text, onPendingChange }: { text: string; onPendingChange: (pending: boolean) => void }) {
  const { pending } = useFormStatus();
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  return (
    <p className="mt-3 min-h-5 text-end text-xs text-maroon-600" aria-live="polite">
      {pending ? text : ""}
    </p>
  );
}
