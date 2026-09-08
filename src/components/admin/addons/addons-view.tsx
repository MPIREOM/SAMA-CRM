"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Car, Pencil, Plus, Sparkles, Zap } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkAddon } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { setAddonActive } from "@/app/(crm)/(app)/addons/actions";
import { InlineAlert } from "../load-error";
import { addonKindLabel, addonUnitLabel, fmtMoney, localName } from "../shared";
import { AddonDialog } from "./addon-dialog";

/** bk_addons row with numeric price and a plain-object details column. */
export type AddonRow = Omit<BkAddon, "price_omr" | "details"> & { price_omr: number; details: Record<string, unknown> };

const STR = {
  subtitle: { en: "Extras guests can add to a booking — APEX Zipline, 4WD transfers. Prices always come from this list.", ar: "الإضافات التي يمكن للنزلاء إضافتها إلى الحجز — أبكس زيبلاين ونقل الدفع الرباعي. الأسعار تُؤخذ دائماً من هذه القائمة." },
  newAddon: { en: "New add-on", ar: "إضافة جديدة" },
  empty: { en: "No add-ons yet", ar: "لا توجد إضافات بعد" },
  emptyDesc: { en: "Create the first add-on so guests can book it with their stay.", ar: "أنشئ أول إضافة ليتمكن النزلاء من حجزها مع إقامتهم." },
  price: { en: "Price", ar: "السعر" },
  unit: { en: "Unit", ar: "الوحدة" },
  maxQty: { en: "Max qty", ar: "الحد الأقصى" },
  taxable: { en: "Taxable", ar: "خاضع للضريبة" },
  sort: { en: "Order", ar: "الترتيب" },
  activeToggle: { en: "Active (shown on the website and the staff form)", ar: "نشطة (تظهر على الموقع ونموذج الموظفين)" },
  taxYes: { en: "Yes — joins the room subtotal before taxes", ar: "نعم — يُضاف إلى إجمالي الغرفة قبل الضرائب" },
  taxNo: { en: "No — final price, added after taxes", ar: "لا — سعر نهائي يُضاف بعد الضرائب" },
} satisfies Strings;

function KindIcon({ kind }: { kind: string }) {
  if (kind === "transfer") return <Car className="h-4 w-4 text-maroon-500" />;
  if (kind === "activity") return <Zap className="h-4 w-4 text-gold-600" />;
  return <Sparkles className="h-4 w-4 text-maroon-400" />;
}

export function AddonsView({ addons }: { addons: AddonRow[] }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<AddonRow | "new" | null>(null);

  function toggleActive(a: AddonRow, active: boolean) {
    setError(null);
    start(async () => {
      const r = await setAddonActive({ id: a.id, is_active: active });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader
        title={COMMON.addons[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <Button onClick={() => setEdit("new")}>
            <Plus className="h-4 w-4" />
            {STR.newAddon[lang]}
          </Button>
        }
      />

      <div className="mb-4">
        <InlineAlert kind="error" message={error} />
      </div>

      <Card className="overflow-hidden">
        {addons.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title={STR.empty[lang]}
            description={STR.emptyDesc[lang]}
            action={
              <Button onClick={() => setEdit("new")}>
                <Plus className="h-4 w-4" />
                {STR.newAddon[lang]}
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{COMMON.name[lang]}</TH>
                <TH>{COMMON.kind[lang]}</TH>
                <TH className="ltr:text-right rtl:text-left">{STR.price[lang]}</TH>
                <TH>{STR.unit[lang]}</TH>
                <TH>{STR.maxQty[lang]}</TH>
                <TH>{STR.taxable[lang]}</TH>
                <TH>{COMMON.status[lang]}</TH>
                <TH>{STR.sort[lang]}</TH>
                <TH className="ltr:text-right rtl:text-left">{COMMON.actions[lang]}</TH>
              </tr>
            </THead>
            <TBody>
              {addons.map((a) => (
                <TR key={a.id} data-testid="addon-row" className={cn(!a.is_active && "bg-stone-50 text-maroon-400")}>
                  <TD className="max-w-[22rem]">
                    <div className="flex items-center gap-2">
                      <KindIcon kind={a.kind} />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-maroon-900">{localName(a, lang)}</p>
                        <p className="truncate text-xs text-maroon-400" dir="auto">
                          {lang === "ar" ? a.name_en : a.name_ar}
                        </p>
                        <p className="font-mono text-[10px] text-maroon-300" dir="ltr">
                          {a.slug}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <Badge variant="outline">{addonKindLabel(a.kind, lang)}</Badge>
                  </TD>
                  <TD className="font-semibold ltr:text-right rtl:text-left">{fmtMoney(a.price_omr, lang)}</TD>
                  <TD>{addonUnitLabel(a.unit, lang)}</TD>
                  <TD>{a.max_quantity}</TD>
                  <TD title={a.taxable ? STR.taxYes[lang] : STR.taxNo[lang]}>{a.taxable ? COMMON.yes[lang] : COMMON.no[lang]}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Switch checked={a.is_active} disabled={pending} onCheckedChange={(v) => toggleActive(a, v)} label={STR.activeToggle[lang]} />
                      <span className={cn("text-xs font-semibold", a.is_active ? "text-jabal-700" : "text-stone-700")}>
                        {a.is_active ? COMMON.active[lang] : COMMON.inactive[lang]}
                      </span>
                    </div>
                  </TD>
                  <TD className="text-maroon-400">{a.sort_order}</TD>
                  <TD className="ltr:text-right rtl:text-left">
                    <Button size="sm" variant="outline" onClick={() => setEdit(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {COMMON.edit[lang]}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <AddonDialog addon={edit} onClose={() => setEdit(null)} />
    </div>
  );
}
