"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Loader2,
  Mail,
  Megaphone,
  MessageCircle,
  Plus,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { Campaign } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  campaignFilter,
  campaignMarketLabel,
  countRecipients,
} from "@/components/campaigns/recipients";

const STR = {
  subtitle: {
    en: "Marketing broadcasts via WhatsApp & email",
    ar: "الرسائل التسويقية الجماعية عبر واتساب والبريد الإلكتروني",
  },
  newCampaign: { en: "New campaign", ar: "حملة جديدة" },
  channel: { en: "Channel", ar: "القناة" },
  segment: { en: "Segment", ar: "الشريحة" },
  sentCol: { en: "Sent", ar: "أُرسلت" },
  created: { en: "Created", ar: "تاريخ الإنشاء" },
  send: { en: "Send", ar: "إرسال" },
  resume: { en: "Resume", ar: "استئناف" },
  retry: { en: "Retry", ar: "إعادة المحاولة" },
  statusDraft: { en: "Draft", ar: "مسودة" },
  statusSending: { en: "Sending", ar: "قيد الإرسال" },
  statusSent: { en: "Sent", ar: "تم الإرسال" },
  statusFailed: { en: "Failed", ar: "فشلت" },
  confirmTitle: { en: "Send campaign", ar: "إرسال الحملة" },
  confirmWarning: {
    en: "This sends immediately to every matching opted-in contact and cannot be undone.",
    ar: "سيتم الإرسال فورًا إلى جميع جهات الاتصال الموافقة المطابقة ولا يمكن التراجع عن ذلك.",
  },
  recipients: { en: "Opted-in recipients", ar: "المستلمون الموافقون" },
  confirmSend: { en: "Confirm & send", ar: "تأكيد وإرسال" },
  resultTitle: { en: "Send result", ar: "نتيجة الإرسال" },
  resultSent: { en: "Sent", ar: "أُرسلت" },
  resultSkipped: { en: "Skipped", ar: "تم تخطيها" },
  resultFailed: { en: "Failed", ar: "فشلت" },
  alreadySent: {
    en: "This campaign has already been sent or is sending now.",
    ar: "تم إرسال هذه الحملة مسبقًا أو أنها قيد الإرسال الآن.",
  },
  sendFailed: {
    en: "Could not send the campaign",
    ar: "تعذر إرسال الحملة",
  },
  noCampaigns: { en: "No campaigns yet", ar: "لا توجد حملات بعد" },
  noCampaignsDesc: {
    en: "Create your first broadcast to reach opted-in guests.",
    ar: "أنشئ أول حملة للوصول إلى الضيوف الموافقين على التسويق.",
  },
  loadFailed: { en: "Could not load campaigns", ar: "تعذر تحميل الحملات" },
} satisfies Strings;

type Access = "loading" | "granted" | "denied";
type SendState = "confirm" | "sending" | "done" | "error";

interface SendResult {
  sent: number;
  skipped: number;
  failed: number;
}

function StatusBadge({ status, lang }: { status: string | null; lang: "en" | "ar" }) {
  switch (status) {
    case "sending":
      return <Badge variant="gold">{STR.statusSending[lang]}</Badge>;
    case "sent":
      return <Badge variant="green">{STR.statusSent[lang]}</Badge>;
    case "failed":
      return <Badge variant="red">{STR.statusFailed[lang]}</Badge>;
    default:
      return <Badge variant="gray">{STR.statusDraft[lang]}</Badge>;
  }
}

function ChannelBadge({ channel, lang }: { channel: string | null; lang: "en" | "ar" }) {
  if (channel === "email") {
    return (
      <Badge variant="gold">
        <Mail className="h-3 w-3" />
        {COMMON.emailChannel[lang]}
      </Badge>
    );
  }
  return (
    <Badge variant="green">
      <MessageCircle className="h-3 w-3" />
      {COMMON.whatsapp[lang]}
    </Badge>
  );
}

export default function CampaignsPage() {
  const { lang } = useLang();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [access, setAccess] = useState<Access>("loading");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Send-confirmation dialog state.
  const [sendTarget, setSendTarget] = useState<Campaign | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [sendState, setSendState] = useState<SendState>("confirm");
  const [errorKind, setErrorKind] = useState<"conflict" | "generic" | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  // Client-side role guard (RLS is the real backstop).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setAccess("denied");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setAccess(profile?.role === "super_admin" ? "granted" : "denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (access !== "granted") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setLoadError(Boolean(error));
        setCampaigns(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access, supabase]);

  // Freshly compute the live opted-in recipient count when the dialog opens.
  useEffect(() => {
    if (!sendTarget) return;
    let cancelled = false;
    setCountLoading(true);
    setLiveCount(null);
    (async () => {
      try {
        const count = await countRecipients(supabase, campaignFilter(sendTarget));
        if (!cancelled) setLiveCount(count);
      } catch {
        if (!cancelled) setLiveCount(null);
      } finally {
        if (!cancelled) setCountLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sendTarget, supabase]);

  const openSendDialog = (campaign: Campaign) => {
    setSendTarget(campaign);
    setSendState("confirm");
    setErrorKind(null);
    setResult(null);
  };

  const closeSendDialog = () => {
    if (sendState === "sending") return; // don't abandon an in-flight send
    setSendTarget(null);
  };

  const handleConfirmSend = async () => {
    if (!sendTarget) return;
    setSendState("sending");
    setErrorKind(null);
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sendTarget.id }),
      });
      if (res.status === 409) {
        setErrorKind("conflict");
        setSendState("error");
        return;
      }
      if (!res.ok) {
        setErrorKind("generic");
        setSendState("error");
        return;
      }
      const data = (await res.json()) as Partial<SendResult>;
      const outcome: SendResult = {
        sent: data.sent ?? 0,
        skipped: data.skipped ?? 0,
        failed: data.failed ?? 0,
      };
      setResult(outcome);
      setSendState("done");
      // Mirror the API's final status rule in the table.
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === sendTarget.id
            ? {
                ...c,
                status:
                  outcome.sent === 0 && outcome.failed > 0 ? "failed" : "sent",
                sent: outcome.sent,
                scheduled_for: null,
              }
            : c
        )
      );
    } catch {
      setErrorKind("generic");
      setSendState("error");
    }
  };

  const numberFor = (n: number) =>
    n.toLocaleString(lang === "ar" ? "ar-OM" : "en-GB");

  return (
    <div>
      <PageHeader
        title={COMMON.campaigns[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          access === "granted" ? (
            <Button onClick={() => router.push("/campaigns/new")}>
              <Plus className="h-4 w-4" />
              {STR.newCampaign[lang]}
            </Button>
          ) : undefined
        }
      />

      {access === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-maroon-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          {COMMON.loading[lang]}
        </div>
      ) : access === "denied" ? (
        <Card>
          <EmptyState
            icon={<ShieldAlert className="h-8 w-8" />}
            title={COMMON.noAccess[lang]}
          />
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-maroon-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          {COMMON.loading[lang]}
        </div>
      ) : loadError ? (
        <Card>
          <EmptyState title={STR.loadFailed[lang]} description={COMMON.error[lang]} />
        </Card>
      ) : campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone className="h-8 w-8" />}
            title={STR.noCampaigns[lang]}
            description={STR.noCampaignsDesc[lang]}
            action={
              <Button onClick={() => router.push("/campaigns/new")}>
                <Plus className="h-4 w-4" />
                {STR.newCampaign[lang]}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR className="bg-transparent">
                <TH>{COMMON.name[lang]}</TH>
                <TH>{STR.channel[lang]}</TH>
                <TH>{STR.segment[lang]}</TH>
                <TH>{COMMON.market[lang]}</TH>
                <TH>{COMMON.status[lang]}</TH>
                <TH>{STR.sentCol[lang]}</TH>
                <TH>{STR.created[lang]}</TH>
                <TH>{COMMON.actions[lang]}</TH>
              </TR>
            </THead>
            <TBody>
              {campaigns.map((campaign) => (
                <TR key={campaign.id} className="hover:bg-maroon-50/50">
                  <TD className="font-semibold text-maroon-900">
                    {campaign.name ?? "—"}
                  </TD>
                  <TD>
                    <ChannelBadge channel={campaign.channel} lang={lang} />
                  </TD>
                  <TD>
                    {!campaign.segment || campaign.segment === "All" ? (
                      <span className="text-maroon-400">{COMMON.all[lang]}</span>
                    ) : (
                      <Badge variant="outline">{campaign.segment}</Badge>
                    )}
                  </TD>
                  <TD>{campaignMarketLabel(campaign.market, lang)}</TD>
                  <TD>
                    <StatusBadge status={campaign.status} lang={lang} />
                  </TD>
                  <TD>{numberFor(campaign.sent ?? 0)}</TD>
                  <TD className="text-maroon-500">
                    {formatDate(campaign.created_at, lang)}
                  </TD>
                  <TD>
                    {(() => {
                      // Drafts send; interrupted ("sending") campaigns resume;
                      // failed ones retry — all via the same send endpoint.
                      // "sent" campaigns get no action.
                      const actionLabel =
                        campaign.status === "draft"
                          ? STR.send
                          : campaign.status === "sending"
                          ? STR.resume
                          : campaign.status === "failed"
                          ? STR.retry
                          : null;
                      if (!actionLabel) return null;
                      return (
                        <Button
                          size="sm"
                          variant="gold"
                          onClick={() => openSendDialog(campaign)}
                          disabled={sendState === "sending"}
                        >
                          <Send className="h-3.5 w-3.5 rtl:-scale-x-100" />
                          {actionLabel[lang]}
                        </Button>
                      );
                    })()}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={sendTarget !== null}
        onClose={closeSendDialog}
        title={
          sendState === "done" ? STR.resultTitle[lang] : STR.confirmTitle[lang]
        }
      >
        {sendTarget && (
          <div className="space-y-4">
            {sendState === "done" && result ? (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-jabal-200 bg-jabal-50 px-3 py-4">
                    <p className="text-2xl font-extrabold text-jabal-700" dir="ltr">
                      {numberFor(result.sent)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-jabal-700">
                      {STR.resultSent[lang]}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gold-200 bg-gold-50 px-3 py-4">
                    <p className="text-2xl font-extrabold text-gold-800" dir="ltr">
                      {numberFor(result.skipped)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-gold-800">
                      {STR.resultSkipped[lang]}
                    </p>
                  </div>
                  <div className="rounded-xl border border-crimson-200 bg-crimson-50 px-3 py-4">
                    <p className="text-2xl font-extrabold text-crimson-700" dir="ltr">
                      {numberFor(result.failed)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-crimson-700">
                      {STR.resultFailed[lang]}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end border-t border-maroon-100 pt-4">
                  <Button onClick={() => setSendTarget(null)}>
                    {COMMON.close[lang]}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Campaign summary */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-maroon-400">
                      {COMMON.name[lang]}
                    </dt>
                    <dd className="mt-0.5 font-semibold text-maroon-900">
                      {sendTarget.name ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-maroon-400">
                      {STR.channel[lang]}
                    </dt>
                    <dd className="mt-0.5">
                      <ChannelBadge channel={sendTarget.channel} lang={lang} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-maroon-400">
                      {STR.segment[lang]}
                    </dt>
                    <dd className="mt-0.5 font-semibold text-maroon-900">
                      {!sendTarget.segment || sendTarget.segment === "All"
                        ? COMMON.all[lang]
                        : sendTarget.segment}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-maroon-400">
                      {COMMON.market[lang]}
                    </dt>
                    <dd className="mt-0.5 font-semibold text-maroon-900">
                      {campaignMarketLabel(sendTarget.market, lang)}
                    </dd>
                  </div>
                </dl>

                {/* Live recipient count */}
                <div className="flex items-center gap-3 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-500 text-maroon-900">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold leading-tight text-gold-800" dir="ltr">
                      {countLoading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-gold-700" />
                      ) : liveCount !== null ? (
                        numberFor(liveCount)
                      ) : (
                        "—"
                      )}
                    </p>
                    <p className="text-xs font-semibold text-gold-900">
                      {STR.recipients[lang]}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-maroon-50 px-3 py-2.5 text-xs leading-relaxed text-maroon-500">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                  {STR.confirmWarning[lang]}
                </div>

                {sendState === "error" && (
                  <p className="text-sm font-semibold text-crimson-700" role="alert">
                    {errorKind === "conflict"
                      ? STR.alreadySent[lang]
                      : STR.sendFailed[lang]}
                  </p>
                )}

                <div className="flex justify-end gap-2 border-t border-maroon-100 pt-4">
                  <Button
                    variant="outline"
                    onClick={closeSendDialog}
                    disabled={sendState === "sending"}
                  >
                    {COMMON.cancel[lang]}
                  </Button>
                  <Button
                    onClick={() => void handleConfirmSend()}
                    loading={sendState === "sending"}
                    disabled={errorKind === "conflict"}
                  >
                    {sendState === "sending" ? (
                      COMMON.sending[lang]
                    ) : (
                      <>
                        <Send className="h-4 w-4 rtl:-scale-x-100" />
                        {STR.confirmSend[lang]}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
