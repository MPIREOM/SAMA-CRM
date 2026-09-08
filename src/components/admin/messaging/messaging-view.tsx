"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, MailX, RotateCcw, Send, XCircle } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkMessageLog, BkScheduledMessage, Role } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cancelMessage, retryMessage, sendTestMessage, setChannelEnabled } from "@/app/(crm)/(app)/messaging/actions";
import { InlineAlert } from "../load-error";
import {
  CHANNELS,
  MESSAGE_KINDS,
  SCHEDULED_STATUSES,
  channelLabel,
  fmtDateTime,
  kindLabel,
  scheduledStatusLabel,
  scheduledStatusVariant,
  type MessageChannel,
} from "../shared";
import type { PreviewResult } from "./preview-adapter";

export type QueueRow = BkScheduledMessage & {
  booking: { ref: string; guest_name: string; guest_phone: string; guest_email: string | null; preferred_lang: string } | null;
};

export type PreviewMap = Record<string, PreviewResult>;

const STR = {
  subtitle: { en: "Scheduled guest messages, delivery log, channel switches and template previews", ar: "رسائل النزلاء المجدولة وسجل الإرسال ومفاتيح القنوات ومعاينة القوالب" },
  queue: { en: "Scheduled queue", ar: "قائمة الإرسال المجدولة" },
  log: { en: "Send log (latest 200)", ar: "سجل الإرسال (آخر 200)" },
  switches: { en: "Channels", ar: "القنوات" },
  emailOn: { en: "Email sending", ar: "إرسال البريد الإلكتروني" },
  waOn: { en: "WhatsApp sending", ar: "إرسال واتساب" },
  switchHint: { en: "Off = messages stay pending and are marked skipped by the dispatcher.", ar: "إيقاف = تبقى الرسائل معلقة ويتم تخطيها من المرسِل." },
  allStatuses: { en: "All statuses", ar: "كل الحالات" },
  allKinds: { en: "All kinds", ar: "كل الأنواع" },
  allChannels: { en: "All channels", ar: "كل القنوات" },
  sendAt: { en: "Send at", ar: "وقت الإرسال" },
  attempts: { en: "Attempts", ar: "المحاولات" },
  lastError: { en: "Last error", ar: "آخر خطأ" },
  emptyQueue: { en: "Nothing scheduled", ar: "لا توجد رسائل مجدولة" },
  emptyQueueDesc: { en: "Confirmation, pre-arrival and post-stay messages appear here once bookings exist.", ar: "ستظهر هنا رسائل التأكيد وقبل الوصول وبعد الإقامة عند وجود حجوزات." },
  emptyLog: { en: "No sends yet", ar: "لا توجد إرسالات بعد" },
  payload: { en: "payload", ar: "البيانات" },
  templates: { en: "Template previews", ar: "معاينة القوالب" },
  notBuilt: { en: "Templates are not built yet (Phase 3). Previews will appear here automatically once src/lib/messaging/templates.ts exists.", ar: "القوالب لم تُبنَ بعد (المرحلة 3). ستظهر المعاينات هنا تلقائياً عند توفر الوحدة." },
  sendTest: { en: "Send test", ar: "إرسال تجريبي" },
  testTo: { en: "Send a test to", ar: "إرسال تجريبي إلى" },
  testSent: { en: "Test sent", ar: "تم إرسال الرسالة التجريبية" },
  testUnavailable: { en: "Saved the address. Sending is not wired yet (Phase 3).", ar: "تم حفظ العنوان. الإرسال غير مفعّل بعد (المرحلة 3)." },
  recipient: { en: "Recipient", ar: "المستلم" },
  showing: { en: "showing", ar: "عرض" },
  subject: { en: "Subject", ar: "الموضوع" },
} satisfies Strings;

interface Props {
  role: Role;
  queue: QueueRow[];
  log: BkMessageLog[];
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  testPhone: string;
  testEmail: string;
  previews: PreviewMap;
}

export function MessagingView({ role, queue, log, emailEnabled, whatsappEnabled, testPhone, testEmail, previews }: Props) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState("");
  const [fKind, setFKind] = useState("");
  const [fChannel, setFChannel] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<(typeof MESSAGE_KINDS)[number]>("confirmation");
  const [previewChannel, setPreviewChannel] = useState<MessageChannel>("whatsapp");
  const [testPhoneInput, setTestPhoneInput] = useState(testPhone);
  const [testEmailInput, setTestEmailInput] = useState(testEmail);
  const isAdmin = role === "super_admin";

  const filtered = useMemo(
    () => queue.filter((m) => (!fStatus || m.status === fStatus) && (!fKind || m.kind === fKind) && (!fChannel || m.channel === fChannel)),
    [queue, fStatus, fKind, fChannel]
  );

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        if (success) setNotice(success);
        router.refresh();
      }
    });
  }

  function sendTest(channel: MessageChannel) {
    const to = channel === "email" ? testEmailInput : testPhoneInput;
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await sendTestMessage({ kind: previewKind, channel, to });
      if (!r.ok) setError(r.error);
      else {
        setNotice(r.data.available ? STR.testSent[lang] : STR.testUnavailable[lang]);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <PageHeader title={COMMON.messaging[lang]} subtitle={STR.subtitle[lang]} />
      <div className="mb-4 space-y-2">
        <InlineAlert kind="error" message={error} />
        <InlineAlert kind="success" message={notice} />
      </div>

      {/* Switches */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{STR.switches[lang]}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-3 text-sm font-semibold text-maroon-800">
            <Switch checked={emailEnabled} disabled={!isAdmin || pending} onCheckedChange={(v) => run(() => setChannelEnabled({ channel: "email", enabled: v }))} label={STR.emailOn[lang]} />
            {STR.emailOn[lang]}
            <Badge variant={emailEnabled ? "green" : "gray"}>{emailEnabled ? COMMON.on[lang] : COMMON.off[lang]}</Badge>
          </label>
          <label className="flex items-center gap-3 text-sm font-semibold text-maroon-800">
            <Switch checked={whatsappEnabled} disabled={!isAdmin || pending} onCheckedChange={(v) => run(() => setChannelEnabled({ channel: "whatsapp", enabled: v }))} label={STR.waOn[lang]} />
            {STR.waOn[lang]}
            <Badge variant={whatsappEnabled ? "green" : "gray"}>{whatsappEnabled ? COMMON.on[lang] : COMMON.off[lang]}</Badge>
          </label>
          <p className="basis-full text-xs text-maroon-400">{STR.switchHint[lang]}</p>
        </CardContent>
      </Card>

      {/* Queue */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{STR.queue[lang]}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-8 w-36 text-xs" aria-label={STR.allStatuses[lang]}>
              <option value="">{STR.allStatuses[lang]}</option>
              {SCHEDULED_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {scheduledStatusLabel(s, lang)}
                </option>
              ))}
            </Select>
            <Select value={fKind} onChange={(e) => setFKind(e.target.value)} className="h-8 w-36 text-xs" aria-label={STR.allKinds[lang]}>
              <option value="">{STR.allKinds[lang]}</option>
              {MESSAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k, lang)}
                </option>
              ))}
            </Select>
            <Select value={fChannel} onChange={(e) => setFChannel(e.target.value)} className="h-8 w-32 text-xs" aria-label={STR.allChannels[lang]}>
              <option value="">{STR.allChannels[lang]}</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {channelLabel(c, lang)}
                </option>
              ))}
            </Select>
            <span className="self-center text-xs text-maroon-400">
              {STR.showing[lang]} {filtered.length}/{queue.length}
            </span>
          </div>
        </CardHeader>
        {filtered.length === 0 ? (
          <EmptyState icon={<MailX className="h-8 w-8" />} title={STR.emptyQueue[lang]} description={STR.emptyQueueDesc[lang]} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{COMMON.ref[lang]}</TH>
                <TH>{COMMON.guest[lang]}</TH>
                <TH>{COMMON.kind[lang]}</TH>
                <TH>{COMMON.channel[lang]}</TH>
                <TH>{STR.sendAt[lang]}</TH>
                <TH>{COMMON.status[lang]}</TH>
                <TH>{STR.attempts[lang]}</TH>
                <TH>{STR.lastError[lang]}</TH>
                <TH className="ltr:text-right rtl:text-left">{COMMON.actions[lang]}</TH>
              </tr>
            </THead>
            <TBody>
              {filtered.map((m) => (
                <TR key={m.id} className={cn(m.status === "failed" && "bg-crimson-50/40")}>
                  <TD className="font-bold text-maroon-900">
                    <Link href={`/reservations/${m.booking_id}`} className="hover:underline">
                      {m.booking?.ref ?? "—"}
                    </Link>
                  </TD>
                  <TD>
                    <p className="font-semibold">{m.booking?.guest_name ?? "—"}</p>
                    <p className="text-xs text-maroon-400" dir="ltr">
                      {m.channel === "email" ? (m.booking?.guest_email ?? "—") : (m.booking?.guest_phone ?? "—")}
                    </p>
                  </TD>
                  <TD>{kindLabel(m.kind, lang)}</TD>
                  <TD>{channelLabel(m.channel, lang)}</TD>
                  <TD className="text-xs">{fmtDateTime(m.send_at, lang)}</TD>
                  <TD>
                    <Badge variant={scheduledStatusVariant(m.status)}>{scheduledStatusLabel(m.status, lang)}</Badge>
                  </TD>
                  <TD>{m.attempts}</TD>
                  <TD className="max-w-[14rem] truncate text-xs text-crimson-700" title={m.last_error ?? undefined}>
                    {m.last_error ?? ""}
                  </TD>
                  <TD className="ltr:text-right rtl:text-left">
                    <div className="inline-flex gap-1">
                      {(m.status === "failed" || m.status === "cancelled" || m.status === "skipped" || m.status === "stubbed" || m.status === "sent") && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => retryMessage({ id: m.id }))} title={COMMON.retry[lang]}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {(m.status === "pending" || m.status === "failed") && (
                        <Button size="sm" variant="ghost" className="text-crimson-700" disabled={pending} onClick={() => run(() => cancelMessage({ id: m.id }))} title={COMMON.cancel[lang]}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Log */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader>
          <CardTitle>{STR.log[lang]}</CardTitle>
        </CardHeader>
        {log.length === 0 ? (
          <EmptyState title={STR.emptyLog[lang]} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{COMMON.date[lang]}</TH>
                <TH>{COMMON.kind[lang]}</TH>
                <TH>{COMMON.channel[lang]}</TH>
                <TH>{STR.recipient[lang]}</TH>
                <TH>{COMMON.status[lang]}</TH>
                <TH>{STR.lastError[lang]}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {log.map((m) => (
                <Fragment key={m.id}>
                  <TR>
                    <TD className="text-xs">{fmtDateTime(m.created_at, lang)}</TD>
                    <TD>{kindLabel(m.kind, lang)}</TD>
                    <TD>{channelLabel(m.channel, lang)}</TD>
                    <TD dir="ltr" className="text-xs">
                      {m.booking_id ? (
                        <Link href={`/reservations/${m.booking_id}`} className="hover:underline">
                          {m.recipient ?? "—"}
                        </Link>
                      ) : (
                        (m.recipient ?? "—")
                      )}
                    </TD>
                    <TD>
                      <Badge variant={scheduledStatusVariant(m.status)}>{m.status}</Badge>
                    </TD>
                    <TD className="max-w-[14rem] truncate text-xs text-crimson-700" title={m.error ?? undefined}>
                      {m.error ?? ""}
                    </TD>
                    <TD>
                      {m.payload !== null && (
                        <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-maroon-500 hover:text-maroon-800" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                          {expanded === m.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {STR.payload[lang]}
                        </button>
                      )}
                    </TD>
                  </TR>
                  {expanded === m.id && (
                    <tr className="bg-maroon-50/60">
                      <td colSpan={7} className="px-4 py-2">
                        <pre className="max-h-64 overflow-auto scrollbar-thin rounded bg-white p-3 text-[11px] leading-snug text-maroon-800" dir="ltr">
                          {JSON.stringify(m.payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Template previews + test sends */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{STR.templates[lang]}</CardTitle>
          <div className="flex gap-2">
            <Select value={previewKind} onChange={(e) => setPreviewKind(e.target.value as (typeof MESSAGE_KINDS)[number])} className="h-8 w-40 text-xs" aria-label={STR.allKinds[lang]}>
              {MESSAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k, lang)}
                </option>
              ))}
            </Select>
            <Select value={previewChannel} onChange={(e) => setPreviewChannel(e.target.value as MessageChannel)} className="h-8 w-32 text-xs" aria-label={STR.allChannels[lang]}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {channelLabel(c, lang)}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(["en", "ar"] as const).map((locale) => {
              const p = previews[`${previewKind}:${previewChannel}:${locale}`];
              return (
                <div key={locale} className="rounded-lg border border-maroon-100 bg-maroon-50/40 p-3" dir={locale === "ar" ? "rtl" : "ltr"}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-maroon-400">{locale === "ar" ? "العربية" : "English"}</p>
                  {!p || !p.available ? (
                    <p className="text-sm text-maroon-500">{STR.notBuilt[lang]}</p>
                  ) : (
                    <>
                      {p.preview.subject && (
                        <p className="mb-1 text-sm font-semibold text-maroon-900">
                          {STR.subject[lang]}: {p.preview.subject}
                        </p>
                      )}
                      {p.preview.html && previewChannel === "email" ? (
                        <iframe title={`${previewKind}-${locale}`} srcDoc={p.preview.html} className="h-96 w-full rounded border border-maroon-100 bg-white" sandbox="" />
                      ) : (
                        <pre className="whitespace-pre-wrap rounded bg-white p-3 text-sm text-maroon-800">{p.preview.body}</pre>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <div className="grid gap-3 border-t border-maroon-100 pt-4 sm:grid-cols-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="test-whatsapp" className="mb-1 block text-xs font-semibold text-maroon-500">{STR.testTo[lang]} · WhatsApp</label>
                  <Input id="test-whatsapp" dir="ltr" value={testPhoneInput} onChange={(e) => setTestPhoneInput(e.target.value)} placeholder="+9689XXXXXXX" />
                </div>
                <Button variant="outline" loading={pending} disabled={!testPhoneInput} onClick={() => sendTest("whatsapp")}>
                  <Send className="h-4 w-4" />
                  {STR.sendTest[lang]}
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="test-email" className="mb-1 block text-xs font-semibold text-maroon-500">{STR.testTo[lang]} · {COMMON.emailChannel[lang]}</label>
                  <Input id="test-email" dir="ltr" type="email" value={testEmailInput} onChange={(e) => setTestEmailInput(e.target.value)} placeholder="you@samahotel.net" />
                </div>
                <Button variant="outline" loading={pending} disabled={!testEmailInput} onClick={() => sendTest("email")}>
                  <Send className="h-4 w-4" />
                  {STR.sendTest[lang]}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
