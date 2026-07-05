"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CheckCircle2, Languages, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { COMMON, dirFor, type Lang, type Strings } from "@/lib/i18n";
import { COUNTRY_CODES, normalizePhone } from "@/lib/phone";

const STR = {
  title: { en: "Guest Check-in", ar: "تسجيل وصول الضيوف" },
  subtitle: {
    en: "Welcome to Sama Hotel — please fill in your details",
    ar: "أهلاً بكم في فندق سما — يرجى تعبئة بياناتكم",
  },
  namePlaceholder: { en: "Full name", ar: "الاسم الكامل" },
  phonePlaceholder: { en: "91234567", ar: "91234567" },
  selectPlaceholder: { en: "Select…", ar: "اختر…" },
  otherNationality: {
    en: "Please specify your nationality",
    ar: "يرجى تحديد الجنسية",
  },
  consent: {
    en: "I agree to receive offers and updates from Sama Hotel on WhatsApp/email",
    ar: "أوافق على استلام عروض وتحديثات فندق سما عبر واتساب والبريد الإلكتروني",
  },
  submit: { en: "Check in", ar: "تسجيل الوصول" },
  errName: { en: "Please enter your name", ar: "يرجى إدخال الاسم" },
  errPhone: {
    en: "Please enter a valid phone number",
    ar: "يرجى إدخال رقم هاتف صحيح",
  },
  errSubmit: {
    en: "Something went wrong, please try again",
    ar: "حدث خطأ ما، يرجى المحاولة مرة أخرى",
  },
  thanks: {
    en: "Thank you! Enjoy your stay",
    ar: "شكراً لكم! نتمنى لكم إقامة سعيدة",
  },
  thanksSub: {
    en: "Your details have been received",
    ar: "تم استلام بياناتكم بنجاح",
  },
  staffExit: { en: "Staff exit", ar: "خروج الموظفين" },
  pinLabel: { en: "PIN", ar: "الرقم السري" },
  pinConfirm: { en: "Unlock", ar: "فتح" },
  pinWrong: { en: "Incorrect PIN", ar: "الرقم السري غير صحيح" },
  pinNotConfigured: {
    en: "Exit PIN is not configured on this device",
    ar: "لم يتم إعداد رقم الخروج السري على هذا الجهاز",
  },
} satisfies Strings;

const NATIONALITIES: { value: string; en: string; ar: string }[] = [
  { value: "Omani", en: "Omani", ar: "عُماني" },
  { value: "Saudi", en: "Saudi", ar: "سعودي" },
  { value: "Emirati", en: "Emirati", ar: "إماراتي" },
  { value: "Kuwaiti", en: "Kuwaiti", ar: "كويتي" },
  { value: "Qatari", en: "Qatari", ar: "قطري" },
  { value: "Bahraini", en: "Bahraini", ar: "بحريني" },
  { value: "Egyptian", en: "Egyptian", ar: "مصري" },
  { value: "Indian", en: "Indian", ar: "هندي" },
  { value: "Pakistani", en: "Pakistani", ar: "باكستاني" },
  { value: "British", en: "British", ar: "بريطاني" },
  { value: "German", en: "German", ar: "ألماني" },
  { value: "French", en: "French", ar: "فرنسي" },
  { value: "American", en: "American", ar: "أمريكي" },
  { value: "Other", en: "Other", ar: "أخرى" },
];

function RequiredMark() {
  return (
    <span aria-hidden className="ms-0.5 text-gold-600">
      *
    </span>
  );
}

export function CheckinKiosk() {
  // Kiosk-local language — deliberately NOT the shared cookie/provider.
  const [lang, setLang] = useState<Lang>("ar");
  const dir = dirFor(lang);

  // Form state
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+968");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [nationality, setNationality] = useState("");
  const [otherNationality, setOtherNationality] = useState("");
  const [consent, setConsent] = useState(true); // pre-ticked by design
  const [errors, setErrors] = useState<{ name: boolean; phone: boolean }>({
    name: false,
    phone: false,
  });
  const [serverError, setServerError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Hidden staff-exit state
  const taps = useRef<number[]>([]);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<"wrong" | "unconfigured" | null>(
    null
  );
  const [pinLoading, setPinLoading] = useState(false);

  // Thank-you screen auto-resets to a clean form for the next guest.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      setName("");
      setCountryCode("+968");
      setPhoneNumber("");
      setEmail("");
      setBirthday("");
      setNationality("");
      setOtherNationality("");
      setConsent(true);
      setErrors({ name: false, phone: false });
      setServerError(false);
      setLang("ar");
      setDone(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [done]);

  const handleSecretTap = useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      setPinOpen(true);
    }
  }, []);

  const closePin = useCallback(() => {
    setPinOpen(false);
    setPin("");
    setPinError(null);
    setPinLoading(false);
  }, []);

  async function submitPin(e: FormEvent) {
    e.preventDefault();
    setPinLoading(true);
    setPinError(null);
    try {
      const res = await fetch("/api/kiosk/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        window.location.href = "/login";
        return;
      }
      setPinError(res.status === 503 ? "unconfigured" : "wrong");
    } catch {
      setPinError("wrong");
    }
    setPinLoading(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const phone = normalizePhone(`${countryCode}${phoneNumber}`);
    const nextErrors = {
      name: !cleanName,
      phone: !phoneNumber.trim() || !phone,
    };
    setErrors(nextErrors);
    setServerError(false);
    if (nextErrors.name || nextErrors.phone || !phone) return;

    const nat =
      nationality === "Other" ? otherNationality.trim() : nationality;

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          phone,
          email: email.trim() || null,
          birthday: birthday || null,
          nationality: nat || null,
          consent,
          lang,
        }),
      });
      const json: { ok?: boolean; error?: string } | null = await res
        .json()
        .catch(() => null);
      if (res.ok && json?.ok) {
        setDone(true);
      } else if (json?.error === "invalid_phone") {
        setErrors({ name: false, phone: true });
      } else {
        setServerError(true);
      }
    } catch {
      setServerError(true);
    }
    setSubmitting(false);
  }

  return (
    <div className="relative flex h-screen select-none items-center justify-center overflow-hidden bg-maroon-800 p-4 sm:p-6">
      {/* Subtle gold radial glow (same treatment as the login brand panel). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, #c5a04f 0, transparent 45%), radial-gradient(circle at 85% 90%, #c5a04f 0, transparent 35%)",
        }}
      />

      {/* Invisible staff-exit tap target: 5 taps within 3s in the top-left corner. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={handleSecretTap}
        className="fixed left-0 top-0 z-50 h-16 w-16 cursor-default opacity-0"
      />

      <div
        dir={dir}
        className="relative z-10 flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="overflow-y-auto scrollbar-thin p-6 sm:p-8">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold tracking-wide text-gold-600">
                SAMA <span className="text-gold-400">·</span> سما
              </p>
              <h1 className="mt-1.5 text-2xl font-extrabold text-maroon-900">
                {STR.title[lang]}
              </h1>
              <p className="mt-1 text-sm text-maroon-400">
                {STR.subtitle[lang]}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm font-bold text-maroon-800 hover:bg-gold-100"
            >
              <Languages className="h-4 w-4 text-gold-700" />
              {lang === "en" ? "العربية" : "English"}
            </button>
          </div>

          {done ? (
            /* Thank-you screen — replaces the form, auto-resets after 4s. */
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-jabal-50">
                <CheckCircle2 className="h-16 w-16 text-jabal-600" />
              </div>
              <h2 className="mt-6 text-2xl font-extrabold text-maroon-900">
                {STR.thanks[lang]}
              </h2>
              <p className="mt-2 text-sm text-maroon-400">
                {STR.thanksSub[lang]}
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {/* Name (required) */}
              <div>
                <Label htmlFor="kiosk-name">
                  {COMMON.name[lang]}
                  <RequiredMark />
                </Label>
                <Input
                  id="kiosk-name"
                  value={name}
                  autoComplete="off"
                  placeholder={STR.namePlaceholder[lang]}
                  onChange={(e) => setName(e.target.value)}
                />
                {errors.name && (
                  <p className="mt-1 text-xs font-semibold text-crimson-700">
                    {STR.errName[lang]}
                  </p>
                )}
              </div>

              {/* Phone (required) */}
              <div>
                <Label htmlFor="kiosk-phone">
                  {COMMON.phone[lang]}
                  <RequiredMark />
                </Label>
                <div className="flex gap-2">
                  <Select
                    aria-label={COMMON.phone[lang]}
                    dir="ltr"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-36 shrink-0"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} {lang === "ar" ? c.ar : c.en}
                      </option>
                    ))}
                  </Select>
                  <Input
                    id="kiosk-phone"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder={STR.phonePlaceholder[lang]}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="flex-1"
                  />
                </div>
                {errors.phone && (
                  <p className="mt-1 text-xs font-semibold text-crimson-700">
                    {STR.errPhone[lang]}
                  </p>
                )}
              </div>

              {/* Email + birthday (optional) */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="kiosk-email">
                    {COMMON.email[lang]}
                    <span className="ms-1.5 text-xs font-normal text-maroon-300">
                      ({COMMON.optional[lang]})
                    </span>
                  </Label>
                  <Input
                    id="kiosk-email"
                    type="email"
                    dir="ltr"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="guest@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="kiosk-birthday">
                    {COMMON.birthday[lang]}
                    <span className="ms-1.5 text-xs font-normal text-maroon-300">
                      ({COMMON.optional[lang]})
                    </span>
                  </Label>
                  <Input
                    id="kiosk-birthday"
                    type="date"
                    dir="ltr"
                    value={birthday}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setBirthday(e.target.value)}
                  />
                </div>
              </div>

              {/* Nationality (optional) */}
              <div>
                <Label htmlFor="kiosk-nationality">
                  {COMMON.nationality[lang]}
                  <span className="ms-1.5 text-xs font-normal text-maroon-300">
                    ({COMMON.optional[lang]})
                  </span>
                </Label>
                <Select
                  id="kiosk-nationality"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                >
                  <option value="">{STR.selectPlaceholder[lang]}</option>
                  {NATIONALITIES.map((n) => (
                    <option key={n.value} value={n.value}>
                      {n[lang]}
                    </option>
                  ))}
                </Select>
                {nationality === "Other" && (
                  <Input
                    aria-label={COMMON.nationality[lang]}
                    className="mt-2"
                    placeholder={STR.otherNationality[lang]}
                    value={otherNationality}
                    onChange={(e) => setOtherNationality(e.target.value)}
                  />
                )}
              </div>

              {/* Marketing consent — pre-ticked */}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-maroon-100 bg-maroon-50/60 px-3 py-2">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-jabal-600"
                />
                <span className="text-xs leading-snug text-maroon-600">
                  {STR.consent[lang]}
                </span>
              </label>

              {serverError && (
                <p className="rounded-lg bg-crimson-50 px-3 py-2 text-sm font-semibold text-crimson-700">
                  {STR.errSubmit[lang]}
                </p>
              )}

              <Button
                type="submit"
                variant="gold"
                size="lg"
                loading={submitting}
                className="w-full"
              >
                {STR.submit[lang]}
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* Staff-exit PIN dialog */}
      <div dir={dir}>
        <Dialog
          open={pinOpen}
          onClose={closePin}
          title={STR.staffExit[lang]}
          className="max-w-sm"
        >
          <form onSubmit={submitPin} className="space-y-4">
            <div>
              <Label htmlFor="kiosk-pin">
                <span className="inline-flex items-center gap-1.5">
                  <LockKeyhole className="h-4 w-4 text-gold-700" />
                  {STR.pinLabel[lang]}
                </span>
              </Label>
              <Input
                id="kiosk-pin"
                type="password"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
              {pinError && (
                <p className="mt-1.5 text-xs font-semibold text-crimson-700">
                  {pinError === "unconfigured"
                    ? STR.pinNotConfigured[lang]
                    : STR.pinWrong[lang]}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closePin}>
                {COMMON.cancel[lang]}
              </Button>
              <Button type="submit" loading={pinLoading}>
                {STR.pinConfirm[lang]}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </div>
  );
}
