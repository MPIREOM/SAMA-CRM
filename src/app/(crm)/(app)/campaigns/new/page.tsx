"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Info,
  Loader2,
  Save,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  countRecipients,
  campaignMarketLabel,
  EMAIL_MARKET_OPTIONS,
  WHATSAPP_MARKET_OPTIONS,
  type CampaignChannel,
} from "@/components/campaigns/recipients";

const STR = {
  title: { en: "New campaign", ar: "حملة جديدة" },
  subtitle: {
    en: "Compose a marketing broadcast to opted-in guests",
    ar: "إنشاء رسالة تسويقية جماعية للضيوف الموافقين",
  },
  backToList: { en: "Back to campaigns", ar: "الرجوع إلى الحملات" },
  detailsTitle: { en: "Campaign details", ar: "تفاصيل الحملة" },
  nameLabel: { en: "Campaign name", ar: "اسم الحملة" },
  namePlaceholder: { en: "e.g. Eid weekend offer", ar: "مثال: عرض عطلة العيد" },
  channelLabel: { en: "Channel", ar: "القناة" },
  segmentLabel: { en: "Segment", ar: "الشريحة" },
  allContacts: { en: "All contacts", ar: "كل جهات الاتصال" },
  marketField: { en: "Market", ar: "السوق" },
  waPolicyHint: {
    en: "WhatsApp marketing is limited to Oman & GCC by policy — International contacts are always excluded.",
    ar: "التسويق عبر واتساب مقصور على عُمان ودول الخليج بموجب السياسة — يتم استبعاد جهات الاتصال الدولية دائمًا.",
  },
  bodyLabel: { en: "Message body", ar: "نص الرسالة" },
  bodyPlaceholder: {
    en: "Arabic text…\n⸻\nEnglish text…",
    ar: "النص العربي…\n⸻\nالنص الإنجليزي…",
  },
  variablesLabel: { en: "Variables", ar: "المتغيرات" },
  bodyHint: {
    en: "Write Arabic first, then a ⸻ divider line, then English. {{terms_link}} is required in marketing offers.",
    ar: "اكتب النص العربي أولًا، ثم سطر الفاصل ⸻، ثم النص الإنجليزي. المتغير {{terms_link}} إلزامي في العروض التسويقية.",
  },
  recipients: { en: "Opted-in recipients", ar: "المستلمون الموافقون" },
  recipientsHint: {
    en: "Live count — updates as you change the channel, segment or market. Only contacts with marketing consent are counted.",
    ar: "عدد مباشر — يتحدّث عند تغيير القناة أو الشريحة أو السوق. تُحتسب فقط جهات الاتصال الموافقة على التسويق.",
  },
  saveDraft: { en: "Save draft", ar: "حفظ كمسودة" },
  saveSend: { en: "Save & send", ar: "حفظ وإرسال" },
  saveFailed: { en: "Could not save the campaign", ar: "تعذر حفظ الحملة" },
} satisfies Strings;

const VARIABLES = ["{{name}}", "{{terms_link}}"];

type Access = "loading" | "granted" | "denied";

export default function NewCampaignPage() {
  const { lang } = useLang();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [access, setAccess] = useState<Access>("loading");

  // Form state.
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("whatsapp");
  const [segment, setSegment] = useState("All");
  const [market, setMarket] = useState<string>("Oman+GCC");
  const [body, setBody] = useState("");

  const [tags, setTags] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(true);

  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [saveError, setSaveError] = useState(false);

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

  // Distinct tags from contacts for the segment picker.
  useEffect(() => {
    if (access !== "granted") return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("contacts")
        .select("tags")
        .not("tags", "is", null)
        .limit(2000);
      if (cancelled) return;
      const set = new Set<string>();
      for (const row of data ?? []) {
        for (const t of row.tags ?? []) if (t.trim()) set.add(t.trim());
      }
      setTags(Array.from(set).sort((a, b) => a.localeCompare(b)));
    })();
    return () => {
      cancelled = true;
    };
  }, [access, supabase]);

  // LIVE recipient count — re-queries on every channel/segment/market change.
  useEffect(() => {
    if (access !== "granted") return;
    let cancelled = false;
    setCounting(true);
    (async () => {
      try {
        const n = await countRecipients(supabase, { channel, segment, market });
        if (!cancelled) setCount(n);
      } catch {
        if (!cancelled) setCount(null);
      } finally {
        if (!cancelled) setCounting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access, supabase, channel, segment, market]);

  const marketOptions: readonly string[] =
    channel === "whatsapp" ? WHATSAPP_MARKET_OPTIONS : EMAIL_MARKET_OPTIONS;

  const handleChannelChange = (value: string) => {
    const next: CampaignChannel = value === "email" ? "email" : "whatsapp";
    setChannel(next);
    // Reset market to the channel's default so it always stays valid.
    setMarket(next === "whatsapp" ? "Oman+GCC" : "All");
  };

  const insertVariable = (variable: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((t) => t + variable);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + variable + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + variable.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const valid = name.trim() !== "" && body.trim() !== "";
  const busy = savingDraft || sendingNow;

  const insertCampaign = async (): Promise<string | null> => {
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        name: name.trim(),
        channel,
        segment,
        market,
        body: body.trim(),
        status: "draft",
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return data.id;
  };

  const handleSaveDraft = async () => {
    if (!valid || busy) return;
    setSavingDraft(true);
    setSaveError(false);
    const id = await insertCampaign();
    if (!id) {
      setSavingDraft(false);
      setSaveError(true);
      return;
    }
    router.push("/campaigns");
  };

  const handleSaveAndSend = async () => {
    if (!valid || busy) return;
    setSendingNow(true);
    setSaveError(false);
    const id = await insertCampaign();
    if (!id) {
      setSendingNow(false);
      setSaveError(true);
      return;
    }
    try {
      await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // The list page reflects the campaign's final status either way.
    }
    router.push("/campaigns");
  };

  return (
    <div>
      <PageHeader
        title={STR.title[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <Button variant="outline" onClick={() => router.push("/campaigns")}>
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
            {STR.backToList[lang]}
          </Button>
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
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{STR.detailsTitle[lang]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label htmlFor="campaign-name">
                  {STR.nameLabel[lang]}{" "}
                  <span className="text-crimson-600">*</span>
                </Label>
                <Input
                  id="campaign-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={STR.namePlaceholder[lang]}
                  maxLength={120}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="campaign-channel">{STR.channelLabel[lang]}</Label>
                  <Select
                    id="campaign-channel"
                    value={channel}
                    onChange={(e) => handleChannelChange(e.target.value)}
                  >
                    <option value="whatsapp">{COMMON.whatsapp[lang]}</option>
                    <option value="email">{COMMON.emailChannel[lang]}</option>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="campaign-segment">{STR.segmentLabel[lang]}</Label>
                  <Select
                    id="campaign-segment"
                    value={segment}
                    onChange={(e) => setSegment(e.target.value)}
                  >
                    <option value="All">{STR.allContacts[lang]}</option>
                    {tags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="campaign-market">{STR.marketField[lang]}</Label>
                  <Select
                    id="campaign-market"
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                  >
                    {marketOptions.map((m) => (
                      <option key={m} value={m}>
                        {campaignMarketLabel(m, lang)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {channel === "whatsapp" && (
                <div className="flex items-start gap-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2.5 text-xs leading-relaxed text-gold-900">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" />
                  {STR.waPolicyHint[lang]}
                </div>
              )}

              <div>
                <Label htmlFor="campaign-body">
                  {STR.bodyLabel[lang]}{" "}
                  <span className="text-crimson-600">*</span>
                </Label>
                <Textarea
                  id="campaign-body"
                  ref={bodyRef}
                  rows={10}
                  dir="auto"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={STR.bodyPlaceholder[lang]}
                  className="leading-relaxed"
                />
              </div>

              <div>
                <Label>{STR.variablesLabel[lang]}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      dir="ltr"
                      onClick={() => insertVariable(v)}
                      className="rounded-full border border-gold-200 bg-gold-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-maroon-400">
                  {STR.bodyHint[lang]}
                </p>
              </div>

              {saveError && (
                <p className="text-sm font-semibold text-crimson-700" role="alert">
                  {STR.saveFailed[lang]}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-maroon-100 pt-4">
                <Button
                  variant="outline"
                  onClick={() => void handleSaveDraft()}
                  disabled={!valid || sendingNow}
                  loading={savingDraft}
                >
                  {!savingDraft && <Save className="h-4 w-4" />}
                  {savingDraft ? COMMON.saving[lang] : STR.saveDraft[lang]}
                </Button>
                <Button
                  onClick={() => void handleSaveAndSend()}
                  disabled={!valid || savingDraft}
                  loading={sendingNow}
                >
                  {!sendingNow && <Send className="h-4 w-4 rtl:-scale-x-100" />}
                  {sendingNow ? COMMON.sending[lang] : STR.saveSend[lang]}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live opted-in recipient count */}
          <div className="rounded-xl border border-gold-200 bg-gold-50 p-6 text-center shadow-card lg:sticky lg:top-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold-500 text-maroon-900">
              <Users className="h-6 w-6" />
            </div>
            <div
              className="flex min-h-[3rem] items-center justify-center text-5xl font-extrabold text-gold-800"
              dir="ltr"
            >
              {counting ? (
                <Loader2 className="h-8 w-8 animate-spin text-gold-600" />
              ) : count !== null ? (
                count.toLocaleString(lang === "ar" ? "ar-OM" : "en-GB")
              ) : (
                "—"
              )}
            </div>
            <p className="mt-2 text-sm font-bold text-gold-900">
              {STR.recipients[lang]}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gold-700">
              {STR.recipientsHint[lang]}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
