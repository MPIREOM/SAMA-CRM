"use client";

import type { ReactNode } from "react";
import {
  Bell,
  Cake,
  CalendarCheck,
  CalendarClock,
  Mail,
  MessageCircle,
  PenLine,
  RotateCcw,
  Zap,
} from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Lang, type Localized, type Strings } from "@/lib/i18n";
import type { Automation, TriggerKind } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const STR = {
  editTemplate: { en: "Edit template", ar: "تعديل القالب" },
  omanGcc: { en: "Oman + GCC", ar: "عُمان + الخليج" },
} satisfies Strings;

// Human description per trigger kind; {n} is replaced with offset_days.
const DESCRIPTIONS = {
  booking_created: {
    en: "Sent immediately when a booking is created",
    ar: "تُرسل فورًا عند إنشاء الحجز",
  },
  pre_arrival: {
    en: "Sent {n} days before check-in",
    ar: "تُرسل قبل {n} أيام من تاريخ الوصول",
  },
  post_stay: {
    en: "Sent {n} days after check-out",
    ar: "تُرسل بعد {n} أيام من تاريخ المغادرة",
  },
  birthday: {
    en: "Sent on the guest's birthday",
    ar: "تُرسل في يوم ميلاد الضيف",
  },
  win_back: {
    en: "Sent when the last stay was ~11 months ago ({n} days)",
    ar: "تُرسل عندما تكون آخر إقامة قبل نحو 11 شهرًا ({n} يومًا)",
  },
} satisfies Record<TriggerKind, Localized>;

function isTriggerKind(value: string | null): value is TriggerKind {
  return value !== null && value in DESCRIPTIONS;
}

function describeTrigger(automation: Automation, lang: Lang): string {
  if (!isTriggerKind(automation.trigger_kind)) return "—";
  return DESCRIPTIONS[automation.trigger_kind][lang].replace(
    "{n}",
    String(automation.offset_days ?? 0)
  );
}

const TRIGGER_ICONS: Record<TriggerKind, ReactNode> = {
  booking_created: <Zap className="h-5 w-5" />,
  pre_arrival: <CalendarClock className="h-5 w-5" />,
  post_stay: <CalendarCheck className="h-5 w-5" />,
  birthday: <Cake className="h-5 w-5" />,
  win_back: <RotateCcw className="h-5 w-5" />,
};

export function AutomationCard({
  automation,
  onToggle,
  onEdit,
}: {
  automation: Automation;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (automation: Automation) => void;
}) {
  const { lang } = useLang();
  const enabled = automation.enabled ?? false;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-full bg-maroon-50 p-2.5 text-maroon-500">
            {isTriggerKind(automation.trigger_kind) ? (
              TRIGGER_ICONS[automation.trigger_kind]
            ) : (
              <Bell className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-maroon-900">
              {automation.name ?? "—"}
            </h3>
            <p className="mt-0.5 text-sm text-maroon-400">
              {describeTrigger(automation, lang)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {automation.msg_type === "utility" && (
                <Badge variant="green">{COMMON.utility[lang]}</Badge>
              )}
              {automation.msg_type === "marketing" && (
                <Badge variant="gold">{COMMON.marketing[lang]}</Badge>
              )}
              {automation.market === "All" && (
                <Badge variant="maroon">{COMMON.all[lang]}</Badge>
              )}
              {automation.market === "Oman+GCC" && (
                <Badge variant="maroon">{STR.omanGcc[lang]}</Badge>
              )}
              {automation.channel === "whatsapp" && (
                <Badge variant="outline">
                  <MessageCircle className="h-3 w-3" />
                  {COMMON.whatsapp[lang]}
                </Badge>
              )}
              {automation.channel === "email" && (
                <Badge variant="outline">
                  <Mail className="h-3 w-3" />
                  {COMMON.emailChannel[lang]}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end">
          <div className="flex items-center gap-2">
            <span
              className={
                enabled
                  ? "text-xs font-semibold text-jabal-700"
                  : "text-xs font-semibold text-maroon-400"
              }
            >
              {enabled ? COMMON.on[lang] : COMMON.off[lang]}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={(next) => onToggle(automation.id, next)}
              label={automation.name ?? COMMON.automations[lang]}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => onEdit(automation)}>
            <PenLine className="h-3.5 w-3.5" />
            {STR.editTemplate[lang]}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
