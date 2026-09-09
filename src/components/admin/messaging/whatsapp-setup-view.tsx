"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, RefreshCw, Send, XCircle } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { adoptPublicNumber, createMissingTemplates, registerWebhook, resubmitTemplate, saveAppId, saveBusinessAccountId } from "@/app/(crm)/(app)/messaging/whatsapp/actions";
import { InlineAlert } from "../load-error";
import { kindLabel } from "../shared";
import type { TemplateCreateOutcome, WhatsAppSetupStatus } from "./whatsapp-setup-types";

const STR = {
  title: { en: "WhatsApp setup", ar: "إعداد واتساب" },
  subtitle: {
    en: "Connect the shared WhatsApp number: credentials, webhook, templates and the public number — all from here.",
    ar: "ربط رقم واتساب المشترك: بيانات الاعتماد وWebhook والقوالب والرقم العام — كل ذلك من هنا.",
  },
  back: { en: "Back to messaging", ar: "العودة إلى الرسائل" },
  step1: { en: "1 · Credentials (Vercel environment variables)", ar: "1 · بيانات الاعتماد (متغيرات بيئة Vercel)" },
  step2: { en: "2 · Webhook (where Meta delivers messages and receipts)", ar: "2 · Webhook (وجهة الرسائل والإيصالات من Meta)" },
  step3: { en: "3 · Message templates (WhatsApp Manager)", ar: "3 · قوالب الرسائل (WhatsApp Manager)" },
  step4: { en: "4 · Public number on the website", ar: "4 · الرقم العام على الموقع" },
  step5: { en: "5 · Test", ar: "5 · اختبار" },
  present: { en: "set", ar: "مضبوط" },
  missing: { en: "missing", ar: "غير مضبوط" },
  optionalUnset: { en: "not set (optional)", ar: "غير مضبوط (اختياري)" },
  sendToLearn: {
    en: "Not known yet. Send any WhatsApp message to the hotel number from your phone: the first webhook Meta delivers carries the account id and it is saved automatically. Or paste it below.",
    ar: "غير معروف بعد. أرسلوا أي رسالة واتساب إلى رقم الفندق من هاتفكم: أول Webhook تسلّمه Meta يحمل معرّف الحساب ويُحفظ تلقائياً. أو ألصقوه أدناه.",
  },
  envHint: {
    en: "Values are read from Vercel → Project → Settings → Environment Variables (Production) and take effect after a redeploy. Copy them from the SAAS project; the verify token may keep its SAAS name.",
    ar: "تُقرأ القيم من Vercel → المشروع → Settings → Environment Variables (Production) وتسري بعد إعادة النشر. انسخوها من مشروع SAAS؛ يمكن الإبقاء على اسم رمز التحقق كما هو في SAAS.",
  },
  token: { en: "Access token", ar: "رمز الوصول" },
  tokenValid: { en: "valid", ar: "صالح" },
  tokenInvalid: { en: "invalid", ar: "غير صالح" },
  expires: { en: "expires", ar: "ينتهي" },
  never: { en: "never (system user)", ar: "لا ينتهي (مستخدم نظام)" },
  scopes: { en: "permissions", ar: "الصلاحيات" },
  phone: { en: "Phone number", ar: "رقم الهاتف" },
  verifiedName: { en: "display name", ar: "الاسم الظاهر" },
  quality: { en: "quality", ar: "الجودة" },
  waba: { en: "WhatsApp Business Account", ar: "حساب واتساب للأعمال" },
  wabaInput: { en: "WhatsApp Business Account ID", ar: "معرّف حساب واتساب للأعمال" },
  wabaHint: {
    en: "Only needed if it could not be discovered from the token. Meta for Developers → your app → WhatsApp → API Setup shows it next to the phone number id; WhatsApp Manager → Account tools shows it too. Saved here, no redeploy needed.",
    ar: "مطلوب فقط إذا تعذّر اكتشافه من الرمز. يظهر في Meta for Developers → التطبيق → WhatsApp → API Setup بجانب معرّف رقم الهاتف، وكذلك في WhatsApp Manager → Account tools. يُحفظ هنا دون إعادة نشر.",
  },
  save: { en: "Save", ar: "حفظ" },
  wabaSaved: { en: "Account id saved.", ar: "تم حفظ معرّف الحساب." },
  discovery: { en: "discovery", ar: "الاكتشاف" },
  appId: { en: "Meta app", ar: "تطبيق Meta" },
  appIdInput: { en: "Meta app ID", ar: "معرّف تطبيق Meta" },
  appIdHint: {
    en: "Needed to upload the sample image, video or PDF of a template header (Templates page). Only needed when the line above says unknown: Meta for Developers shows the app id at the top of the app dashboard. Saved here, no redeploy needed.",
    ar: "مطلوب لرفع عيّنة الصورة أو الفيديو أو ملف PDF لترويسة القالب (صفحة القوالب). لا حاجة له إلا إذا ظهر «غير معروف»: يظهر معرّف التطبيق أعلى لوحة التطبيق في Meta for Developers. يُحفظ هنا دون إعادة نشر.",
  },
  appIdSaved: { en: "App id saved.", ar: "تم حفظ معرّف التطبيق." },
  unknown: { en: "unknown", ar: "غير معروف" },
  callback: { en: "This deployment's callback URL", ar: "عنوان الاستدعاء لهذا النشر" },
  pointsHere: { en: "Webhooks point here", ar: "الـ Webhooks موجهة إلى هنا" },
  pointsElsewhere: { en: "Webhooks do not point here yet", ar: "الـ Webhooks غير موجهة إلى هنا بعد" },
  appCallback: { en: "App-level callback (Meta dashboard)", ar: "الاستدعاء على مستوى التطبيق (لوحة Meta)" },
  override: { en: "Override for this account", ar: "التجاوز لهذا الحساب" },
  noOverride: { en: "no override — the app-level callback is used", ar: "لا يوجد تجاوز — يُستخدم استدعاء التطبيق" },
  subscribedApps: { en: "Apps subscribed to this account", ar: "التطبيقات المشتركة في هذا الحساب" },
  register: { en: "Point this number's webhooks here", ar: "توجيه Webhooks هذا الرقم إلى هنا" },
  registerHint: {
    en: "Sets an alternate callback on the business phone number itself (Meta's most specific override) — the SAAS app's dashboard configuration is left untouched. Meta verifies the URL immediately using the verify token.",
    ar: "يضبط استدعاءً بديلاً على رقم الهاتف نفسه (أدق تجاوز لدى Meta) — دون تغيير إعدادات تطبيق SAAS في لوحته. تتحقق Meta من العنوان فوراً باستخدام رمز التحقق.",
  },
  effective: { en: "Where Meta sends this number's webhooks", ar: "وجهة Webhooks هذا الرقم لدى Meta" },
  levelPhone: { en: "phone number override", ar: "تجاوز على مستوى الرقم" },
  levelAccount: { en: "account override", ar: "تجاوز على مستوى الحساب" },
  levelApp: { en: "app callback", ar: "استدعاء التطبيق" },
  none: { en: "none", ar: "لا يوجد" },
  registered: { en: "Webhooks now point at this app.", ar: "أصبحت الـ Webhooks موجهة إلى هذا التطبيق." },
  forward: { en: "Relay to the SAAS app", ar: "التمرير إلى تطبيق SAAS" },
  forwardOn: {
    en: "Its admins' messages and every delivery receipt are relayed unchanged; guest conversations stay here.",
    ar: "تُمرَّر رسائل مسؤوليه وجميع إيصالات التسليم دون تغيير؛ وتبقى محادثات النزلاء هنا.",
  },
  forwardOff: {
    en: "WHATSAPP_FORWARD_URL is not set. Pointing the webhooks here would cut the SAAS app off from this number — set it (and WHATSAPP_FORWARD_SENDERS) first.",
    ar: "متغير WHATSAPP_FORWARD_URL غير مضبوط. توجيه الـ Webhooks إلى هنا سيقطع تطبيق SAAS عن هذا الرقم — اضبطوه (مع WHATSAPP_FORWARD_SENDERS) أولاً.",
  },
  forwardSenders: { en: "relayed senders", ar: "المرسلون المُمرَّرون" },
  templatesHint: {
    en: "The three guest messages, each in English and Arabic. Confirmation and pre-arrival are Utility; the post-stay message is Marketing (it carries the SAMA10 offer) and only goes to guests with marketing consent. Bodies are the exact texts in docs/message-content.md. The button creates missing templates and resubmits rejected ones with the current text and category; new submissions show PENDING until Meta approves them, usually within minutes. A rejection for INCORRECT_CATEGORY shows Meta's verdict in the note.",
    ar: "رسائل النزلاء الثلاث، كل منها بالإنجليزية والعربية. التأكيد وما قبل الوصول من فئة Utility؛ ورسالة ما بعد الإقامة من فئة Marketing (تتضمن عرض SAMA10) ولا تُرسل إلا للنزلاء الموافقين على التسويق. النصوص هي ذاتها الموجودة في docs/message-content.md. ينشئ الزر القوالب الناقصة ويعيد إرسال المرفوضة بالنص والفئة الحاليين؛ تظهر الطلبات الجديدة بحالة PENDING حتى توافق عليها Meta، عادةً خلال دقائق. عند الرفض بسبب INCORRECT_CATEGORY يظهر تصنيف Meta في الملاحظة.",
  },
  createTemplates: { en: "Create / resubmit templates", ar: "إنشاء / إعادة إرسال القوالب" },
  templatesDone: { en: "Submitted to Meta.", ar: "تم الإرسال إلى Meta." },
  resubmit: { en: "Resubmit", ar: "إعادة الإرسال" },
  resubmitDone: { en: "Resubmitted to Meta — PENDING until approved again.", ar: "أُعيد الإرسال إلى Meta — بحالة PENDING حتى تتم الموافقة مجدداً." },
  resubmitted: { en: "resubmitted with the current text", ar: "أُعيد إرساله بالنص الحالي" },
  metaSays: { en: "Meta says", ar: "تصنيف Meta" },
  categoryDiffers: { en: "category in Meta", ar: "الفئة في Meta" },
  bodyDiffers: { en: "text in Meta differs from the code", ar: "النص في Meta يختلف عن النص في الكود" },
  resubmitWarning: {
    en: "Resubmitting sends the current text and category for review; the template cannot be sent until Meta approves it again.",
    ar: "إعادة الإرسال ترسل النص والفئة الحاليين للمراجعة؛ لا يمكن إرسال القالب حتى توافق عليه Meta مجدداً.",
  },
  kind: { en: "Message", ar: "الرسالة" },
  name: { en: "Template name", ar: "اسم القالب" },
  language: { en: "Language", ar: "اللغة" },
  status: { en: "Status", ar: "الحالة" },
  note: { en: "Note", ar: "ملاحظة" },
  current: { en: "Website currently shows", ar: "الموقع يعرض حالياً" },
  cloudNumber: { en: "Number behind the Cloud API", ar: "الرقم خلف Cloud API" },
  adopt: { en: "Use this number on the website", ar: "استخدام هذا الرقم على الموقع" },
  adopted: { en: "Website contact updated.", ar: "تم تحديث رقم التواصل على الموقع." },
  sameNumber: { en: "Same number — nothing to change.", ar: "الرقم نفسه — لا حاجة لأي تغيير." },
  numberHint: {
    en: "Guests reply to the number that messaged them. Keeping the website's WhatsApp button on the same number avoids two conversations.",
    ar: "يرد النزلاء على الرقم الذي راسلهم. إبقاء زر واتساب في الموقع على الرقم نفسه يجنّب وجود محادثتين.",
  },
  testHint: {
    en: "From the Messaging page, enter your own number under “Send test” and send the pre-arrival message. The log tells you exactly what is still missing.",
    ar: "من صفحة الرسائل، أدخلوا رقمكم في «إرسال تجريبي» وأرسلوا رسالة ما قبل الوصول. يوضح السجل بدقة ما لا يزال ناقصاً.",
  },
  goMessaging: { en: "Open messaging", ar: "فتح الرسائل" },
  channelOff: {
    en: "The WhatsApp channel is switched off on the Messaging page — nothing will be sent until it is on.",
    ar: "قناة واتساب مغلقة في صفحة الرسائل — لن يُرسل شيء حتى يتم تفعيلها.",
  },
  refresh: { en: "Refresh", ar: "تحديث" },
} satisfies Strings;

interface Props {
  status: WhatsAppSetupStatus;
  publicWhatsApp: string;
  whatsappEnabled: boolean;
}

function statusVariant(status: string): "green" | "gold" | "red" | "gray" {
  if (status === "APPROVED") return "green";
  if (status === "PENDING" || status === "IN_APPEAL") return "gold";
  if (status === "REJECTED" || status === "PAUSED" || status === "DISABLED") return "red";
  return "gray";
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function WhatsAppSetupView({ status, publicWhatsApp, whatsappEnabled }: Props) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<TemplateCreateOutcome[]>([]);
  const [wabaInput, setWabaInput] = useState(status.storedWabaId);
  const [appIdInput, setAppIdInput] = useState(status.storedAppId);

  const env = status.env;
  const canRegister = env.accessToken && env.verifyToken && env.appSecret && Boolean(env.forwardUrl) && !pending;
  const cloudNumber = status.phone.displayPhoneNumber;
  const sameNumber = Boolean(cloudNumber) && digits(cloudNumber) === digits(publicWhatsApp);
  const actionableTemplates = status.templates.rows.filter((r) => r.status === "MISSING" || r.status === "REJECTED").length;

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setNotice(success);
        router.refresh();
      }
    });
  }

  function submitTemplates() {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await createMissingTemplates();
      if (!r.ok) setError(r.error);
      else {
        setOutcomes(r.data.results);
        setNotice(STR.templatesDone[lang]);
        router.refresh();
      }
    });
  }

  const EnvRow = ({ label, ok, optional }: { label: string; ok: boolean; optional?: boolean }) => (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <code className="text-xs text-maroon-700" dir="ltr">
        {label}
      </code>
      <Badge variant={ok ? "green" : optional ? "gray" : "red"}>{ok ? STR.present[lang] : optional ? STR.optionalUnset[lang] : STR.missing[lang]}</Badge>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={STR.title[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => router.refresh()} disabled={pending}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {STR.refresh[lang]}
            </Button>
            <Link href="/messaging" className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-maroon-700 hover:bg-maroon-100">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              {STR.back[lang]}
            </Link>
          </>
        }
      />
      <div className="mb-4 space-y-2">
        <InlineAlert kind="error" message={error} />
        <InlineAlert kind="success" message={notice} />
        {!whatsappEnabled && <InlineAlert kind="error" message={STR.channelOff[lang]} />}
      </div>

      {/* 1 · Credentials */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{STR.step1[lang]}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div>
            <EnvRow label="WHATSAPP_ACCESS_TOKEN" ok={env.accessToken} />
            <EnvRow label="WHATSAPP_PHONE_NUMBER_ID" ok={env.phoneNumberId} />
            <EnvRow label="WHATSAPP_APP_SECRET" ok={env.appSecret} />
            <EnvRow label="WHATSAPP_VERIFY_TOKEN / WHATSAPP_WEBHOOK_VERIFY_TOKEN" ok={env.verifyToken} />
            <EnvRow label="WHATSAPP_BUSINESS_ACCOUNT_ID" ok={env.businessAccountId} optional />
            <p className="mt-3 text-xs text-maroon-400">{STR.envHint[lang]}</p>
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.token[lang]}</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                {status.token.ok ? (
                  <>
                    <Badge variant={status.token.isValid ? "green" : "red"}>{status.token.isValid ? STR.tokenValid[lang] : STR.tokenInvalid[lang]}</Badge>
                    <span className="text-maroon-700">
                      {STR.expires[lang]}: {status.token.expiresAt ? new Date(status.token.expiresAt * 1000).toISOString().slice(0, 10) : STR.never[lang]}
                    </span>
                    {status.token.type && <span className="text-maroon-400">({status.token.type})</span>}
                  </>
                ) : (
                  <span className="text-crimson-700">{status.token.error ?? STR.unknown[lang]}</span>
                )}
              </dd>
              {status.token.scopes.length > 0 && (
                <dd className="mt-1 text-xs text-maroon-400" dir="ltr">
                  {STR.scopes[lang]}: {status.token.scopes.join(", ")}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.phone[lang]}</dt>
              <dd className="mt-1 text-maroon-800">
                {status.phone.ok ? (
                  <span dir="ltr">
                    <strong>{status.phone.displayPhoneNumber ?? status.phone.id}</strong>
                    {status.phone.verifiedName && ` · ${STR.verifiedName[lang]}: ${status.phone.verifiedName}`}
                    {status.phone.qualityRating && ` · ${STR.quality[lang]}: ${status.phone.qualityRating}`}
                  </span>
                ) : (
                  <span className="text-crimson-700">{status.phone.error ?? STR.unknown[lang]}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.waba[lang]}</dt>
              <dd className="mt-1 text-maroon-800" dir="ltr">
                {status.wabaId ?? <span className="text-crimson-700">{STR.unknown[lang]}</span>}
              </dd>
              {!status.wabaId && (
                <dd className="mt-1 max-w-md text-xs text-maroon-600">{STR.sendToLearn[lang]}</dd>
              )}
              {!status.wabaId && status.wabaNotes.length > 0 && (
                <dd className="mt-1 text-xs text-maroon-400" dir="ltr">
                  {STR.discovery[lang]}: {status.wabaNotes.join(" · ")}
                </dd>
              )}
              <dd className="mt-2">
                <label htmlFor="waba-id" className="block text-xs font-semibold text-maroon-600">
                  {STR.wabaInput[lang]}
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Input
                    id="waba-id"
                    dir="ltr"
                    inputMode="numeric"
                    placeholder="1234567890123456"
                    value={wabaInput}
                    onChange={(e) => setWabaInput(e.target.value)}
                    className="h-9 w-56 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || wabaInput.trim() === status.storedWabaId}
                    onClick={() => run(() => saveBusinessAccountId({ id: wabaInput }), STR.wabaSaved[lang])}
                  >
                    {STR.save[lang]}
                  </Button>
                </div>
                <p className="mt-1 max-w-md text-xs text-maroon-400">{STR.wabaHint[lang]}</p>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.appId[lang]}</dt>
              <dd className="mt-1 text-maroon-800" dir="ltr">
                {status.token.appId ?? <span className="text-maroon-400">{STR.unknown[lang]}</span>}
              </dd>
              <dd className="mt-2">
                <label htmlFor="app-id" className="block text-xs font-semibold text-maroon-600">
                  {STR.appIdInput[lang]}
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Input
                    id="app-id"
                    dir="ltr"
                    inputMode="numeric"
                    placeholder="1234567890123456"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    className="h-9 w-56 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || appIdInput.trim() === status.storedAppId}
                    onClick={() => run(() => saveAppId({ id: appIdInput }), STR.appIdSaved[lang])}
                  >
                    {STR.save[lang]}
                  </Button>
                </div>
                <p className="mt-1 max-w-md text-xs text-maroon-400">{STR.appIdHint[lang]}</p>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 2 · Webhook */}
      <Card className="mb-6">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{STR.step2[lang]}</CardTitle>
          <Badge variant={status.webhook.pointsHere ? "green" : "gold"}>{status.webhook.pointsHere ? STR.pointsHere[lang] : STR.pointsElsewhere[lang]}</Badge>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.callback[lang]}</p>
            <code className="mt-1 block break-all text-xs text-maroon-800" dir="ltr">
              {status.callbackUrl}
            </code>
          </div>
          {status.webhook.phone ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.effective[lang]}</p>
              <ul className="mt-1 space-y-0.5 text-xs" dir="ltr">
                {(
                  [
                    ["levelPhone", status.webhook.phone.phoneNumber],
                    ["levelAccount", status.webhook.phone.whatsappBusinessAccount],
                    ["levelApp", status.webhook.phone.application],
                  ] as const
                ).map(([key, value]) => (
                  <li key={key} className={value === status.callbackUrl ? "text-jabal-700" : "text-maroon-700"}>
                    <span className="text-maroon-400">{STR[key][lang]}:</span> {value ? <code className="break-all">{value}</code> : <span className="text-maroon-400">{STR.none[lang]}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            status.webhook.phoneError && <p className="text-xs text-crimson-700">{status.webhook.phoneError}</p>
          )}
          {status.webhook.appCallbackUrl && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.appCallback[lang]}</p>
              <code className="mt-1 block break-all text-xs text-maroon-700" dir="ltr">
                {status.webhook.appCallbackUrl}
              </code>
            </div>
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.subscribedApps[lang]}</p>
            {status.webhook.ok ? (
              status.webhook.apps.length === 0 ? (
                <p className="mt-1 text-maroon-400">—</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {status.webhook.apps.map((a, i) => (
                    <li key={a.id ?? i} className="text-maroon-800" dir="ltr">
                      {a.name ?? a.id ?? "app"}
                      {a.id && <span className="text-maroon-400"> ({a.id})</span>} · {STR.override[lang]}:{" "}
                      {a.overrideCallbackUri ? <code className="break-all text-xs">{a.overrideCallbackUri}</code> : <span className="text-maroon-400">{STR.noOverride[lang]}</span>}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="mt-1 text-crimson-700">{status.webhook.error}</p>
            )}
          </div>
          <div className="rounded-lg border border-maroon-100 bg-maroon-50/50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.forward[lang]}</p>
            {env.forwardUrl ? (
              <>
                <code className="mt-1 block break-all text-xs text-maroon-800" dir="ltr">
                  {env.forwardUrl}
                </code>
                <p className="mt-1 text-xs text-maroon-500">
                  {STR.forwardOn[lang]}{" "}
                  <span dir="ltr">
                    ({STR.forwardSenders[lang]}: {env.forwardSenders.length > 0 ? env.forwardSenders.join(", ") : "—"})
                  </span>
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-crimson-700">{STR.forwardOff[lang]}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => run(registerWebhook, STR.registered[lang])} disabled={!canRegister} loading={pending}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {STR.register[lang]}
            </Button>
            <p className="text-xs text-maroon-400">{STR.registerHint[lang]}</p>
          </div>
        </CardContent>
      </Card>

      {/* 3 · Templates */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{STR.step3[lang]}</CardTitle>
          <Button size="sm" onClick={submitTemplates} disabled={pending || !status.templates.ok || actionableTemplates === 0} loading={pending}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {STR.createTemplates[lang]} {actionableTemplates > 0 ? `(${actionableTemplates})` : ""}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <p className="px-5 py-3 text-xs text-maroon-400">{STR.templatesHint[lang]}</p>
          {!status.templates.ok && <p className="px-5 pb-3 text-sm text-crimson-700">{status.templates.error}</p>}
          <Table>
            <THead>
              <TR>
                <TH>{STR.kind[lang]}</TH>
                <TH>{STR.name[lang]}</TH>
                <TH>{STR.language[lang]}</TH>
                <TH>{STR.status[lang]}</TH>
                <TH>{STR.note[lang]}</TH>
              </TR>
            </THead>
            <TBody>
              {status.templates.rows.map((row) => {
                const outcome = outcomes.find((o) => o.name === row.name && o.language === row.language);
                const shown = outcome?.status ?? row.status;
                const categoryMismatch = row.category !== null && row.category !== row.expectedCategory;
                const metaDisagrees = row.correctCategory !== null && row.correctCategory !== row.category;
                const drifted = categoryMismatch || row.bodyMatches === false;
                const canResubmit =
                  row.id !== null && !outcome?.ok && ["APPROVED", "REJECTED", "PAUSED"].includes(row.status) && (row.status === "REJECTED" || drifted);
                const notes: string[] = [];
                if (outcome?.error) notes.push(outcome.error);
                else if (outcome?.action === "resubmitted") notes.push(STR.resubmitted[lang]);
                if (row.rejectedReason) notes.push(row.rejectedReason);
                if (metaDisagrees) notes.push(`${STR.metaSays[lang]}: ${row.correctCategory}`);
                if (categoryMismatch) notes.push(`${STR.categoryDiffers[lang]}: ${row.category} → ${row.expectedCategory}`);
                if (row.bodyMatches === false) notes.push(STR.bodyDiffers[lang]);
                if (row.issues.length > 0) notes.push(row.issues.join("; "));
                return (
                  <TR key={`${row.name}:${row.language}`}>
                    <TD>{kindLabel(row.kind, lang)}</TD>
                    <TD>
                      <code className="text-xs" dir="ltr">
                        {row.name}
                      </code>
                    </TD>
                    <TD dir="ltr">{row.language}</TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={statusVariant(shown)}>{shown}</Badge>
                        <Badge variant={categoryMismatch ? "red" : row.expectedCategory === "MARKETING" ? "gold" : "outline"}>{row.category ?? row.expectedCategory}</Badge>
                      </div>
                    </TD>
                    <TD className="max-w-md text-xs text-maroon-500">
                      {notes.length > 0 ? notes.join(" · ") : "—"}
                      {canResubmit && (
                        <div className="mt-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            title={STR.resubmitWarning[lang]}
                            onClick={() => run(() => resubmitTemplate({ name: row.name, language: row.language }), STR.resubmitDone[lang])}
                          >
                            {STR.resubmit[lang]}
                          </Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* 4 · Public number */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{STR.step4[lang]}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.current[lang]}</dt>
              <dd className="mt-1 font-semibold text-maroon-800" dir="ltr">
                {publicWhatsApp || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.cloudNumber[lang]}</dt>
              <dd className="mt-1 font-semibold text-maroon-800" dir="ltr">
                {cloudNumber ?? "—"}
              </dd>
            </div>
            <p className="text-xs text-maroon-400 sm:col-span-2">{STR.numberHint[lang]}</p>
          </dl>
          {sameNumber ? (
            <Badge variant="green">{STR.sameNumber[lang]}</Badge>
          ) : (
            <Button variant="outline" onClick={() => run(adoptPublicNumber, STR.adopted[lang])} disabled={!cloudNumber || pending} loading={pending}>
              {STR.adopt[lang]}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 5 · Test */}
      <Card>
        <CardHeader>
          <CardTitle>{STR.step5[lang]}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <p className="text-maroon-700">{STR.testHint[lang]}</p>
          <Link href="/messaging" className="inline-flex h-10 items-center gap-2 rounded-lg bg-maroon-800 px-4 text-sm font-semibold text-gold-100 hover:bg-maroon-700">
            {STR.goMessaging[lang]}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>
      <p className="mt-4 text-xs text-maroon-300">
        <XCircle className="me-1 inline h-3 w-3" aria-hidden="true" />
        {COMMON.whatsapp[lang]} · Meta Graph API
      </p>
    </div>
  );
}
