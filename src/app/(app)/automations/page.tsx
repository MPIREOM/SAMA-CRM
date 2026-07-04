"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Loader2, ShieldAlert, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { Automation } from "@/lib/database.types";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AutomationCard } from "@/components/automations/automation-card";
import { EditTemplateDialog } from "@/components/automations/edit-template-dialog";

const STR = {
  subtitle: {
    en: "Automated guest messaging journeys",
    ar: "رحلات المراسلة التلقائية للضيوف",
  },
  banner: {
    en: "Marketing automations send only to opted-in guests in Oman & GCC. The runner executes daily at 9:00 Muscat time; booking confirmations fire instantly when a booking is created.",
    ar: "تُرسل رسائل الأتمتة التسويقية فقط إلى الضيوف الموافقين في عُمان ودول الخليج. يعمل المشغّل يوميًا في الساعة 9:00 بتوقيت مسقط، بينما تُرسل تأكيدات الحجز فورًا عند إنشاء الحجز.",
  },
  noAutomations: { en: "No automations found", ar: "لا توجد أتمتة" },
  loadFailed: {
    en: "Could not load automations",
    ar: "تعذر تحميل الأتمتة",
  },
} satisfies Strings;

type Access = "loading" | "granted" | "denied";

export default function AutomationsPage() {
  const { lang } = useLang();
  const supabase = useMemo(() => createClient(), []);

  const [access, setAccess] = useState<Access>("loading");
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);

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
        .from("automations")
        .select("*")
        .order("trigger_kind", { ascending: true });
      if (!cancelled) {
        setLoadError(Boolean(error));
        setAutomations(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access, supabase]);

  // Optimistic enable/disable; revert on failure.
  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, enabled } : a))
      );
      const { error } = await supabase
        .from("automations")
        .update({ enabled })
        .eq("id", id);
      if (error) {
        setAutomations((prev) =>
          prev.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a))
        );
      }
    },
    [supabase]
  );

  const handleSaved = useCallback(
    (id: string, patch: { template: string; offset_days?: number }) => {
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
    },
    []
  );

  return (
    <div>
      <PageHeader
        title={COMMON.automations[lang]}
        subtitle={STR.subtitle[lang]}
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
        <>
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-gold-600 bg-gold-50 px-4 py-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" />
            <p className="text-sm leading-relaxed text-gold-900">
              {STR.banner[lang]}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-maroon-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              {COMMON.loading[lang]}
            </div>
          ) : loadError ? (
            <Card>
              <EmptyState
                title={STR.loadFailed[lang]}
                description={COMMON.error[lang]}
              />
            </Card>
          ) : automations.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Workflow className="h-8 w-8" />}
                title={STR.noAutomations[lang]}
              />
            </Card>
          ) : (
            <div className="space-y-4">
              {automations.map((automation) => (
                <AutomationCard
                  key={automation.id}
                  automation={automation}
                  onToggle={(id, enabled) => void handleToggle(id, enabled)}
                  onEdit={setEditing}
                />
              ))}
            </div>
          )}

          <EditTemplateDialog
            automation={editing}
            onClose={() => setEditing(null)}
            onSaved={handleSaved}
          />
        </>
      )}
    </div>
  );
}
