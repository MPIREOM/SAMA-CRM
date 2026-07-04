"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, marketLabel, type Localized, type Strings } from "@/lib/i18n";
import { COUNTRY_CODES, marketFromPhone, normalizePhone } from "@/lib/phone";
import { Badge, marketVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const STR = {
  title: { en: "Add contact", ar: "إضافة جهة اتصال" },
  namePlaceholder: { en: "Guest full name", ar: "الاسم الكامل للضيف" },
  localNumber: { en: "e.g. 91234567", ar: "مثال: 91234567" },
  countryCode: { en: "Country code", ar: "رمز الدولة" },
  tagsPlaceholder: {
    en: "VIP, family, spa (comma separated)",
    ar: "VIP، عائلة، سبا (مفصولة بفواصل)",
  },
  consentHint: {
    en: "Guest agreed to receive marketing messages",
    ar: "وافق الضيف على استلام الرسائل التسويقية",
  },
  marketPreview: { en: "Market", ar: "السوق" },
  arabic: { en: "Arabic", ar: "العربية" },
  english: { en: "English", ar: "الإنجليزية" },
  nameRequired: { en: "Name is required", ar: "الاسم مطلوب" },
  invalidPhone: {
    en: "Invalid phone number — check the country code and digits",
    ar: "رقم هاتف غير صالح — تحقق من رمز الدولة والأرقام",
  },
  phoneExists: {
    en: "A contact with this phone number already exists",
    ar: "توجد جهة اتصال بهذا الرقم مسبقًا",
  },
  saveFailed: { en: "Could not save the contact", ar: "تعذر حفظ جهة الاتصال" },
} satisfies Strings;

export function AddContactDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useLang();
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState("");
  const [dialCode, setDialCode] = useState("+968");
  const [localNumber, setLocalNumber] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [contactLang, setContactLang] = useState<"ar" | "en">("ar");
  const [tagsText, setTagsText] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Localized | null>(null);

  const previewMarket = marketFromPhone(normalizePhone(dialCode + localNumber));

  function reset() {
    setName("");
    setDialCode("+968");
    setLocalNumber("");
    setEmail("");
    setBirthday("");
    setContactLang("ar");
    setTagsText("");
    setConsent(false);
    setError(null);
  }

  function close() {
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(STR.nameRequired);
      return;
    }
    const phone = normalizePhone(dialCode + localNumber);
    if (!phone) {
      setError(STR.invalidPhone);
      return;
    }

    setSaving(true);
    setError(null);

    const tags = tagsText
      .split(/[,،;؛]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const { error: dbError } = await supabase.from("contacts").insert({
      name: trimmedName,
      phone,
      email: email.trim() || null,
      birthday: birthday || null,
      lang: contactLang,
      tags,
      consent,
      consent_source: consent ? "staff_add" : null,
      consent_at: consent ? new Date().toISOString() : null,
    });

    setSaving(false);

    if (dbError) {
      setError(dbError.code === "23505" ? STR.phoneExists : STR.saveFailed);
      return;
    }

    reset();
    onSaved();
  }

  return (
    <Dialog open={open} onClose={close} title={STR.title[lang]}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="contact-name">
            {COMMON.name[lang]}{" "}
            <span className="text-crimson-600" aria-hidden>
              *
            </span>
          </Label>
          <Input
            id="contact-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={STR.namePlaceholder[lang]}
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="contact-phone">
            {COMMON.phone[lang]}{" "}
            <span className="text-crimson-600" aria-hidden>
              *
            </span>
          </Label>
          <div className="flex gap-2" dir="ltr">
            <Select
              aria-label={STR.countryCode[lang]}
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value)}
              className="w-44 shrink-0"
            >
              {COUNTRY_CODES.map((cc) => (
                <option key={cc.iso} value={cc.code}>
                  {cc.flag} {cc.code} — {lang === "ar" ? cc.ar : cc.en}
                </option>
              ))}
            </Select>
            <Input
              id="contact-phone"
              dir="ltr"
              inputMode="tel"
              value={localNumber}
              onChange={(e) => setLocalNumber(e.target.value)}
              placeholder={STR.localNumber[lang]}
            />
          </div>
          {localNumber.trim() && (
            <div className="mt-2 flex items-center gap-2 text-xs text-maroon-500">
              <span>{STR.marketPreview[lang]}:</span>
              <Badge variant={marketVariant(previewMarket)}>
                {marketLabel(previewMarket, lang)}
              </Badge>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-email">
              {COMMON.email[lang]}{" "}
              <span className="font-normal text-maroon-300">
                ({COMMON.optional[lang]})
              </span>
            </Label>
            <Input
              id="contact-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="guest@example.com"
            />
          </div>
          <div>
            <Label htmlFor="contact-birthday">
              {COMMON.birthday[lang]}{" "}
              <span className="font-normal text-maroon-300">
                ({COMMON.optional[lang]})
              </span>
            </Label>
            <Input
              id="contact-birthday"
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-lang">{COMMON.language[lang]}</Label>
            <Select
              id="contact-lang"
              value={contactLang}
              onChange={(e) => setContactLang(e.target.value === "en" ? "en" : "ar")}
            >
              <option value="ar">{STR.arabic[lang]}</option>
              <option value="en">{STR.english[lang]}</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="contact-tags">{COMMON.tags[lang]}</Label>
            <Input
              id="contact-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder={STR.tagsPlaceholder[lang]}
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-maroon-100 bg-maroon-50/50 p-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-maroon-300 accent-jabal-600"
          />
          <span>
            <span className="block text-sm font-semibold text-maroon-800">
              {COMMON.consent[lang]}
            </span>
            <span className="block text-xs text-maroon-400">
              {STR.consentHint[lang]}
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-crimson-50 px-3 py-2 text-sm font-semibold text-crimson-700">
            {error[lang]}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={close}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? COMMON.saving[lang] : COMMON.save[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
