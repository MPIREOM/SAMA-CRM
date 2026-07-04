"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { Automation } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STR = {
  title: { en: "Edit template", ar: "تعديل القالب" },
  templateLabel: { en: "Message template", ar: "قالب الرسالة" },
  offsetLabel: { en: "Days offset", ar: "الإزاحة بالأيام" },
  variablesLabel: { en: "Variables", ar: "المتغيرات" },
  hint: {
    en: "Write Arabic first, then a ⸻ divider line, then English. {{terms_link}} is required in marketing offers.",
    ar: "اكتب النص العربي أولًا، ثم سطر الفاصل ⸻، ثم النص الإنجليزي. المتغير {{terms_link}} إلزامي في العروض التسويقية.",
  },
  saveFailed: { en: "Could not save changes", ar: "تعذر حفظ التغييرات" },
} satisfies Strings;

const VARIABLES = [
  "{{name}}",
  "{{ref}}",
  "{{check_in}}",
  "{{check_out}}",
  "{{room_type}}",
  "{{terms_link}}",
];

const OFFSET_KINDS = ["pre_arrival", "post_stay", "win_back"];

export function EditTemplateDialog({
  automation,
  onClose,
  onSaved,
}: {
  automation: Automation | null;
  onClose: () => void;
  onSaved: (id: string, patch: { template: string; offset_days?: number }) => void;
}) {
  const { lang } = useLang();
  const supabase = useMemo(() => createClient(), []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [template, setTemplate] = useState("");
  const [offsetDays, setOffsetDays] = useState("0");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Re-initialize the form each time a different automation is opened.
  useEffect(() => {
    if (automation) {
      setTemplate(automation.template ?? "");
      setOffsetDays(String(automation.offset_days ?? 0));
      setSaving(false);
      setSaveError(false);
    }
  }, [automation]);

  const hasOffset =
    automation !== null && OFFSET_KINDS.includes(automation.trigger_kind ?? "");

  const insertVariable = (variable: string) => {
    const el = textareaRef.current;
    if (!el) {
      setTemplate((t) => t + variable);
      return;
    }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    const next = template.slice(0, start) + variable + template.slice(end);
    setTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + variable.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSave = async () => {
    if (!automation) return;
    setSaving(true);
    setSaveError(false);

    const patch: { template: string; offset_days?: number } = { template };
    if (hasOffset) {
      const parsed = Number.parseInt(offsetDays, 10);
      patch.offset_days = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    }

    const { error } = await supabase
      .from("automations")
      .update(patch)
      .eq("id", automation.id);

    setSaving(false);
    if (error) {
      setSaveError(true);
      return;
    }
    onSaved(automation.id, patch);
    onClose();
  };

  return (
    <Dialog
      open={automation !== null}
      onClose={onClose}
      title={STR.title[lang]}
      className="max-w-2xl"
    >
      {automation && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-maroon-500">
            {automation.name ?? "—"}
          </p>

          <div>
            <Label htmlFor="automation-template">{STR.templateLabel[lang]}</Label>
            <Textarea
              id="automation-template"
              ref={textareaRef}
              rows={12}
              dir="auto"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
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
              {STR.hint[lang]}
            </p>
          </div>

          {hasOffset && (
            <div>
              <Label htmlFor="automation-offset">{STR.offsetLabel[lang]}</Label>
              <Input
                id="automation-offset"
                type="number"
                min={0}
                dir="ltr"
                value={offsetDays}
                onChange={(e) => setOffsetDays(e.target.value)}
                className="w-32"
              />
            </div>
          )}

          {saveError && (
            <p className="text-sm font-semibold text-crimson-700" role="alert">
              {STR.saveFailed[lang]}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-maroon-100 pt-4">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              {COMMON.cancel[lang]}
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {saving ? COMMON.saving[lang] : COMMON.save[lang]}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
