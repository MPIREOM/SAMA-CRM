"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, marketLabel, type Strings } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { Booking, Contact } from "@/lib/database.types";
import { Badge, marketVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ContactAvatar } from "@/components/inbox/conversation-list";

const STR = {
  title: { en: "Guest details", ar: "بيانات الضيف" },
  noContact: {
    en: "Guest details will appear here.",
    ar: "ستظهر بيانات الضيف هنا.",
  },
  lastStay: { en: "Last stay", ar: "آخر إقامة" },
  nextBooking: { en: "Next booking", ar: "الحجز القادم" },
  noUpcoming: { en: "No upcoming booking", ar: "لا يوجد حجز قادم" },
  openProfile: { en: "Open profile", ar: "فتح الملف الشخصي" },
  langAr: { en: "Arabic", ar: "العربية" },
  langEn: { en: "English", ar: "الإنجليزية" },
} satisfies Strings;

export function GuestPanel({
  contact,
  onContactChange,
}: {
  contact: Contact | null;
  onContactChange: (contact: Contact) => void;
}) {
  const { lang } = useLang();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [nextBooking, setNextBooking] = useState<Booking | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);

  const contactId = contact?.id ?? null;

  // Next upcoming booking for the active guest.
  useEffect(() => {
    if (!contactId) {
      setNextBooking(null);
      return;
    }
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    void supabase
      .from("bookings")
      .select("*")
      .eq("contact_id", contactId)
      .gte("check_in", today)
      .order("check_in", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setNextBooking(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, supabase]);

  async function toggleConsent(next: boolean) {
    if (!contact || savingConsent) return;
    setSavingConsent(true);
    const { data } = await supabase
      .from("contacts")
      .update({
        consent: next,
        consent_at: new Date().toISOString(),
        consent_source: "staff_toggle",
      })
      .eq("id", contact.id)
      .select("*")
      .single();
    if (data) onContactChange(data);
    setSavingConsent(false);
  }

  const tags = contact?.tags ?? [];

  return (
    <Card className="hidden w-72 shrink-0 flex-col overflow-hidden xl:flex">
      <div className="border-b border-maroon-100 px-4 py-3">
        <h2 className="text-sm font-extrabold text-maroon-900">
          {STR.title[lang]}
        </h2>
      </div>

      {!contact ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-sm text-maroon-300">
            {STR.noContact[lang]}
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-5 overflow-y-auto scrollbar-thin p-4">
          {/* Identity */}
          <div className="flex flex-col items-center gap-2 text-center">
            <ContactAvatar name={contact.name} className="h-14 w-14 text-xl" />
            <div>
              <p className="text-sm font-bold text-maroon-900">
                {contact.name}
              </p>
              <p className="text-xs text-maroon-400" dir="ltr">
                {contact.phone}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Badge variant={marketVariant(contact.market)}>
                {marketLabel(contact.market ?? "Unknown", lang)}
              </Badge>
              {contact.lang && (
                <Badge variant="outline">
                  {contact.lang === "ar"
                    ? STR.langAr[lang]
                    : contact.lang === "en"
                      ? STR.langEn[lang]
                      : contact.lang}
                </Badge>
              )}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-maroon-400">
                {COMMON.tags[lang]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="gold">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Consent */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-maroon-100 bg-maroon-50/50 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-maroon-800">
                {COMMON.consent[lang]}
              </p>
              <p className="text-[11px] text-maroon-400">
                {contact.consent
                  ? COMMON.optedIn[lang]
                  : COMMON.optedOut[lang]}
              </p>
            </div>
            <Switch
              checked={Boolean(contact.consent)}
              onCheckedChange={(v) => void toggleConsent(v)}
              disabled={savingConsent}
              label={COMMON.consent[lang]}
            />
          </div>

          {/* Last stay */}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-maroon-400">
              {STR.lastStay[lang]}
            </span>
            <span className="font-semibold text-maroon-800">
              {formatDate(contact.last_stay, lang)}
            </span>
          </div>

          {/* Next booking */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-maroon-400">
              {STR.nextBooking[lang]}
            </p>
            {nextBooking ? (
              <div className="rounded-lg border border-jabal-200 bg-jabal-50 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-jabal-600" />
                  <span
                    className="text-sm font-bold text-jabal-700"
                    dir="ltr"
                  >
                    {nextBooking.ref}
                  </span>
                </div>
                <p className="mt-1 text-xs text-jabal-700">
                  {formatDate(nextBooking.check_in, lang)}
                  {" – "}
                  {formatDate(nextBooking.check_out, lang)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-maroon-300">{STR.noUpcoming[lang]}</p>
            )}
          </div>

          {/* Open profile */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push(`/contacts/${contact.id}`)}
          >
            <UserRound className="h-4 w-4" />
            {STR.openProfile[lang]}
          </Button>
        </div>
      )}
    </Card>
  );
}
