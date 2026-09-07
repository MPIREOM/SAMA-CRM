"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type {
  BookingSettings,
  CancellationSettings,
  ContactSettings,
  PromoCode,
  PromoSettings,
  ReviewSettings,
  TimesSettings,
} from "@/lib/bk/types";
import type { TaxSettings } from "@/lib/booking-engine/pricing";
import type { MessagingSchedule } from "@/lib/booking-engine/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveSettings, type EditableSettingsKey } from "@/app/(crm)/(app)/settings/actions";
import { InlineAlert } from "../load-error";

export interface EnvStatus {
  whatsapp: boolean;
  whatsappWebhook: boolean;
  resend: boolean;
  emailFrom: boolean;
  serviceRole: boolean;
  cronSecret: boolean;
  appUrl: string;
}

const STR = {
  subtitle: { en: "Hotel policies, contact details and booking-engine parameters", ar: "سياسات الفندق وبيانات الاتصال ومعاملات محرك الحجز" },
  taxes: { en: "Taxes & fees", ar: "الضرائب والرسوم" },
  service: { en: "Service charge %", ar: "رسوم الخدمة %" },
  tourism: { en: "Tourism fee %", ar: "رسوم السياحة %" },
  vat: { en: "VAT %", ar: "ضريبة القيمة المضافة %" },
  vatOnFees: { en: "VAT applies on room + fees", ar: "تُطبّق الضريبة على الغرفة والرسوم" },
  enabled: { en: "Enabled", ar: "مفعّل" },
  times: { en: "Check-in / check-out times", ar: "أوقات الوصول والمغادرة" },
  checkInTime: { en: "Check-in from", ar: "الوصول من" },
  checkOutTime: { en: "Check-out by", ar: "المغادرة حتى" },
  cancellation: { en: "Cancellation policy", ar: "سياسة الإلغاء" },
  hoursBefore: { en: "Free cancellation up to (hours before check-in)", ar: "إلغاء مجاني حتى (ساعات قبل الوصول)" },
  policyEn: { en: "Policy text (EN)", ar: "نص السياسة (إنجليزي)" },
  policyAr: { en: "Policy text (AR)", ar: "نص السياسة (عربي)" },
  contact: { en: "Contact details", ar: "بيانات الاتصال" },
  mapsLink: { en: "Google Maps link", ar: "رابط خرائط جوجل" },
  addressEn: { en: "Address (EN)", ar: "العنوان (إنجليزي)" },
  addressAr: { en: "Address (AR)", ar: "العنوان (عربي)" },
  instagram: { en: "Instagram", ar: "إنستغرام" },
  website: { en: "Website", ar: "الموقع الإلكتروني" },
  reviews: { en: "Review links", ar: "روابط التقييم" },
  google: { en: "Google review link", ar: "رابط تقييم جوجل" },
  tripadvisor: { en: "TripAdvisor link", ar: "رابط تريب أدفايزر" },
  booking: { en: "Booking rules", ar: "قواعد الحجز" },
  maxNights: { en: "Max nights per booking", ar: "الحد الأقصى لليالي" },
  maxAdvance: { en: "Max days in advance", ar: "الحد الأقصى للحجز المسبق (أيام)" },
  extraBed: { en: "Extra bed (OMR / night)", ar: "سرير إضافي (ر.ع / ليلة)" },
  childFree: { en: "Children free under (age)", ar: "الأطفال مجاناً تحت سن" },
  rateLimit: { en: "Website bookings per minute per IP", ar: "حجوزات الموقع في الدقيقة لكل IP" },
  messaging: { en: "Message schedule", ar: "جدول الرسائل" },
  preDays: { en: "Pre-arrival: days before check-in", ar: "قبل الوصول: أيام قبل تاريخ الوصول" },
  preTime: { en: "Pre-arrival: send time (Muscat)", ar: "قبل الوصول: وقت الإرسال (مسقط)" },
  postDays: { en: "Post-stay: days after check-out", ar: "بعد الإقامة: أيام بعد المغادرة" },
  postTime: { en: "Post-stay: send time (Muscat)", ar: "بعد الإقامة: وقت الإرسال (مسقط)" },
  promo: { en: "Promo codes", ar: "رموز الخصم" },
  code: { en: "Code", ar: "الرمز" },
  percent: { en: "% off", ar: "نسبة الخصم" },
  validUntil: { en: "Valid until", ar: "صالح حتى" },
  note: { en: "Note", ar: "ملاحظة" },
  addCode: { en: "Add code", ar: "إضافة رمز" },
  noCodes: { en: "No promo codes", ar: "لا توجد رموز خصم" },
  integrations: { en: "Integrations (read-only, from environment)", ar: "التكاملات (للقراءة فقط، من البيئة)" },
  whatsappApi: { en: "WhatsApp Cloud API (token + phone number id)", ar: "واجهة واتساب (الرمز + معرّف الرقم)" },
  whatsappWebhook: { en: "WhatsApp webhook (verify token + app secret)", ar: "ويب هوك واتساب" },
  resend: { en: "Resend API key", ar: "مفتاح Resend" },
  emailFrom: { en: "Email sender (EMAIL_FROM)", ar: "مرسل البريد (EMAIL_FROM)" },
  serviceRole: { en: "Supabase service role key", ar: "مفتاح خدمة Supabase" },
  cron: { en: "Dispatcher cron", ar: "مجدول الإرسال" },
  configured: { en: "Configured", ar: "مضبوط" },
  missing: { en: "Missing", ar: "غير مضبوط" },
  saved: { en: "Saved", ar: "تم الحفظ" },
  appUrl: { en: "App URL", ar: "رابط التطبيق" },
} satisfies Strings;

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  const { lang } = useLang();
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-maroon-700">{label}</span>
      <span className="flex items-center gap-2">
        {detail && <span className="text-xs text-maroon-400" dir="ltr">{detail}</span>}
        <Badge variant={ok ? "green" : "red"}>
          {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {ok ? STR.configured[lang] : STR.missing[lang]}
        </Badge>
      </span>
    </div>
  );
}

/** One settings key = one card with its own form + save button. */
function Section<T extends object>({
  title,
  settingsKey,
  initial,
  children,
}: {
  title: string;
  settingsKey: EditableSettingsKey;
  initial: T;
  children: (state: T, set: <K extends keyof T>(key: K, value: T[K]) => void) => ReactNode;
}) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await saveSettings(settingsKey, state);
      if (!r.ok) setError(r.error);
      else {
        setNotice(STR.saved[lang]);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          {children(state, (key, value) => setState((s) => ({ ...s, [key]: value })))}
          <InlineAlert kind="error" message={error} />
          <InlineAlert kind="success" message={notice} />
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              {COMMON.save[lang]}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const num = (v: string, fallback = 0) => (v === "" ? fallback : Number(v));

interface Props {
  env: EnvStatus;
  taxes: TaxSettings;
  times: TimesSettings;
  cancellation: CancellationSettings;
  contact: ContactSettings;
  reviews: ReviewSettings;
  booking: BookingSettings;
  messaging: MessagingSchedule;
  promo: PromoSettings;
  cronDispatchUrl: string;
  cronSecretSet: boolean;
}

export function SettingsView({ env, taxes, times, cancellation, contact, reviews, booking, messaging, promo, cronDispatchUrl, cronSecretSet }: Props) {
  const { lang } = useLang();

  return (
    <div>
      <PageHeader title={COMMON.settings[lang]} subtitle={STR.subtitle[lang]} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section<TaxSettings> title={STR.taxes[lang]} settingsKey="taxes" initial={taxes}>
          {(s, set) => (
            <div className="space-y-3">
              {(
                [
                  ["service_charge_pct", "service_charge_enabled", STR.service[lang]],
                  ["tourism_fee_pct", "tourism_fee_enabled", STR.tourism[lang]],
                  ["vat_pct", "vat_enabled", STR.vat[lang]],
                ] as const
              ).map(([pct, en, label]) => (
                <div key={pct} className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label htmlFor={`tax-${pct}`}>{label}</Label>
                    <Input id={`tax-${pct}`} type="number" step="0.01" min={0} max={100} dir="ltr" value={s[pct]} onChange={(e) => set(pct, num(e.target.value))} />
                  </div>
                  <label className="mb-2 flex items-center gap-2 text-sm text-maroon-700">
                    <Switch checked={s[en]} onCheckedChange={(v) => set(en, v)} label={STR.enabled[lang]} />
                    {STR.enabled[lang]}
                  </label>
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-maroon-700">
                <Switch checked={s.vat_on_fees} onCheckedChange={(v) => set("vat_on_fees", v)} label={STR.vatOnFees[lang]} />
                {STR.vatOnFees[lang]}
              </label>
            </div>
          )}
        </Section>

        <div className="space-y-6">
          <Section<TimesSettings> title={STR.times[lang]} settingsKey="times" initial={times}>
            {(s, set) => (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="t-in">{STR.checkInTime[lang]}</Label>
                  <Input id="t-in" type="time" value={s.check_in} onChange={(e) => set("check_in", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="t-out">{STR.checkOutTime[lang]}</Label>
                  <Input id="t-out" type="time" value={s.check_out} onChange={(e) => set("check_out", e.target.value)} />
                </div>
              </div>
            )}
          </Section>

          <Section<MessagingSchedule> title={STR.messaging[lang]} settingsKey="messaging" initial={messaging}>
            {(s, set) => (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="m-pre-d">{STR.preDays[lang]}</Label>
                  <Input id="m-pre-d" type="number" min={0} max={30} value={s.pre_arrival_days_before} onChange={(e) => set("pre_arrival_days_before", num(e.target.value))} />
                </div>
                <div>
                  <Label htmlFor="m-pre-t">{STR.preTime[lang]}</Label>
                  <Input id="m-pre-t" type="time" value={s.pre_arrival_time} onChange={(e) => set("pre_arrival_time", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="m-post-d">{STR.postDays[lang]}</Label>
                  <Input id="m-post-d" type="number" min={0} max={30} value={s.post_stay_days_after} onChange={(e) => set("post_stay_days_after", num(e.target.value))} />
                </div>
                <div>
                  <Label htmlFor="m-post-t">{STR.postTime[lang]}</Label>
                  <Input id="m-post-t" type="time" value={s.post_stay_time} onChange={(e) => set("post_stay_time", e.target.value)} />
                </div>
              </div>
            )}
          </Section>
        </div>

        <Section<CancellationSettings> title={STR.cancellation[lang]} settingsKey="cancellation" initial={cancellation}>
          {(s, set) => (
            <div className="space-y-3">
              <div>
                <Label htmlFor="c-hours">{STR.hoursBefore[lang]}</Label>
                <Input id="c-hours" type="number" min={0} value={s.hours_before} onChange={(e) => set("hours_before", num(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="c-en">{STR.policyEn[lang]}</Label>
                <Textarea id="c-en" rows={3} value={s.policy_en} onChange={(e) => set("policy_en", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="c-ar">{STR.policyAr[lang]}</Label>
                <Textarea id="c-ar" dir="rtl" rows={3} value={s.policy_ar} onChange={(e) => set("policy_ar", e.target.value)} />
              </div>
            </div>
          )}
        </Section>

        <Section<ContactSettings> title={STR.contact[lang]} settingsKey="contact" initial={contact}>
          {(s, set) => (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ct-phone">{COMMON.phone[lang]}</Label>
                <Input id="ct-phone" dir="ltr" value={s.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-wa">{COMMON.whatsapp[lang]}</Label>
                <Input id="ct-wa" dir="ltr" value={s.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="ct-email">{COMMON.email[lang]}</Label>
                <Input id="ct-email" type="email" dir="ltr" value={s.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="ct-maps">{STR.mapsLink[lang]}</Label>
                <Input id="ct-maps" type="url" dir="ltr" value={s.maps_link} onChange={(e) => set("maps_link", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-addr-en">{STR.addressEn[lang]}</Label>
                <Input id="ct-addr-en" value={s.address_en} onChange={(e) => set("address_en", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-addr-ar">{STR.addressAr[lang]}</Label>
                <Input id="ct-addr-ar" dir="rtl" value={s.address_ar} onChange={(e) => set("address_ar", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-ig">{STR.instagram[lang]}</Label>
                <Input id="ct-ig" dir="ltr" value={s.instagram} onChange={(e) => set("instagram", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-web">{STR.website[lang]}</Label>
                <Input id="ct-web" type="url" dir="ltr" value={s.website} onChange={(e) => set("website", e.target.value)} />
              </div>
            </div>
          )}
        </Section>

        <Section<ReviewSettings> title={STR.reviews[lang]} settingsKey="reviews" initial={reviews}>
          {(s, set) => (
            <div className="space-y-3">
              <div>
                <Label htmlFor="rv-g">{STR.google[lang]}</Label>
                <Input id="rv-g" type="url" dir="ltr" value={s.google} onChange={(e) => set("google", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="rv-t">{STR.tripadvisor[lang]}</Label>
                <Input id="rv-t" type="url" dir="ltr" value={s.tripadvisor} onChange={(e) => set("tripadvisor", e.target.value)} />
              </div>
            </div>
          )}
        </Section>

        <Section<Omit<BookingSettings, "weekend_days">>
          title={STR.booking[lang]}
          settingsKey="booking"
          initial={{
            max_nights: booking.max_nights,
            max_advance_days: booking.max_advance_days,
            extra_bed_omr: booking.extra_bed_omr,
            child_free_under: booking.child_free_under,
            rate_limit_per_min: booking.rate_limit_per_min,
          }}
        >
          {(s, set) => (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="b-nights">{STR.maxNights[lang]}</Label>
                <Input id="b-nights" type="number" min={1} max={365} value={s.max_nights} onChange={(e) => set("max_nights", num(e.target.value, 1))} />
              </div>
              <div>
                <Label htmlFor="b-adv">{STR.maxAdvance[lang]}</Label>
                <Input id="b-adv" type="number" min={1} max={1095} value={s.max_advance_days} onChange={(e) => set("max_advance_days", num(e.target.value, 1))} />
              </div>
              <div>
                <Label htmlFor="b-bed">{STR.extraBed[lang]}</Label>
                <Input id="b-bed" type="number" step="0.001" min={0} dir="ltr" value={s.extra_bed_omr} onChange={(e) => set("extra_bed_omr", num(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="b-child">{STR.childFree[lang]}</Label>
                <Input id="b-child" type="number" min={0} max={18} value={s.child_free_under} onChange={(e) => set("child_free_under", num(e.target.value))} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="b-rl">{STR.rateLimit[lang]}</Label>
                <Input id="b-rl" type="number" min={1} max={1000} value={s.rate_limit_per_min} onChange={(e) => set("rate_limit_per_min", num(e.target.value, 1))} />
              </div>
            </div>
          )}
        </Section>

        <Section<PromoSettings> title={STR.promo[lang]} settingsKey="promo" initial={promo}>
          {(s, set) => {
            const update = (i: number, patch: Partial<PromoCode>) => set("codes", s.codes.map((c, j) => (j === i ? { ...c, ...patch } : c)));
            return (
              <div className="space-y-2">
                {s.codes.length === 0 && <p className="text-sm text-maroon-400">{STR.noCodes[lang]}</p>}
                {s.codes.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_5rem_8rem_auto_auto] items-end gap-2 rounded-lg border border-maroon-100 p-2">
                    <div>
                      <Label htmlFor={`pc-code-${i}`} className="text-xs">{STR.code[lang]}</Label>
                      <Input id={`pc-code-${i}`} dir="ltr" className="h-9 uppercase" value={c.code} onChange={(e) => update(i, { code: e.target.value.toUpperCase() })} />
                    </div>
                    <div>
                      <Label htmlFor={`pc-pct-${i}`} className="text-xs">{STR.percent[lang]}</Label>
                      <Input id={`pc-pct-${i}`} type="number" min={0} max={100} className="h-9" value={c.percent} onChange={(e) => update(i, { percent: num(e.target.value) })} />
                    </div>
                    <div>
                      <Label htmlFor={`pc-until-${i}`} className="text-xs">{STR.validUntil[lang]}</Label>
                      <Input id={`pc-until-${i}`} type="date" className="h-9" value={c.valid_until ?? ""} onChange={(e) => update(i, { valid_until: e.target.value || null })} />
                    </div>
                    <label className="mb-2 flex items-center gap-1 text-xs text-maroon-700">
                      <Switch checked={c.enabled} onCheckedChange={(v) => update(i, { enabled: v })} label={STR.enabled[lang]} />
                    </label>
                    <Button type="button" size="sm" variant="ghost" className="mb-0.5 text-crimson-700" onClick={() => set("codes", s.codes.filter((_, j) => j !== i))} aria-label={COMMON.remove[lang]}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="col-span-5">
                      <Input placeholder={STR.note[lang]} className="h-8 text-xs" value={c.note ?? ""} onChange={(e) => update(i, { note: e.target.value })} />
                    </div>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => set("codes", [...s.codes, { code: "", percent: 10, valid_until: null, enabled: true, note: "" }])}>
                  <Plus className="h-4 w-4" />
                  {STR.addCode[lang]}
                </Button>
              </div>
            );
          }}
        </Section>

        <Card>
          <CardHeader>
            <CardTitle>{STR.integrations[lang]}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-maroon-100">
            <StatusRow label={STR.whatsappApi[lang]} ok={env.whatsapp} />
            <StatusRow label={STR.whatsappWebhook[lang]} ok={env.whatsappWebhook} />
            <StatusRow label={STR.resend[lang]} ok={env.resend} />
            <StatusRow label={STR.emailFrom[lang]} ok={env.emailFrom} />
            <StatusRow label={STR.serviceRole[lang]} ok={env.serviceRole} />
            <StatusRow label={STR.cron[lang]} ok={cronSecretSet || env.cronSecret} detail={cronDispatchUrl} />
            <StatusRow label={STR.appUrl[lang]} ok={Boolean(env.appUrl)} detail={env.appUrl} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
