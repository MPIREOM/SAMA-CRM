"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createAddon, updateAddon } from "@/app/(crm)/(app)/addons/actions";
import { InlineAlert } from "../load-error";
import { ADDON_KINDS, ADDON_UNITS, addonKindLabel, addonUnitLabel } from "../shared";
import type { AddonRow } from "./addons-view";

const STR = {
  addTitle: { en: "New add-on", ar: "إضافة جديدة" },
  editTitle: { en: "Edit add-on", ar: "تعديل الإضافة" },
  slug: { en: "Slug (URL id)", ar: "المعرّف (slug)" },
  slugHint: { en: "lowercase-with-hyphens; used by the website and the booking engine", ar: "أحرف صغيرة وشرطات؛ يستخدمه الموقع ومحرك الحجز" },
  nameEn: { en: "Name (EN)", ar: "الاسم (إنجليزي)" },
  nameAr: { en: "Name (AR)", ar: "الاسم (عربي)" },
  taglineEn: { en: "Tagline (EN)", ar: "الوصف المختصر (إنجليزي)" },
  taglineAr: { en: "Tagline (AR)", ar: "الوصف المختصر (عربي)" },
  descEn: { en: "Description (EN)", ar: "الوصف (إنجليزي)" },
  descAr: { en: "Description (AR)", ar: "الوصف (عربي)" },
  price: { en: "Price (OMR)", ar: "السعر (ر.ع)" },
  unit: { en: "Priced", ar: "التسعير" },
  maxQty: { en: "Max quantity", ar: "الحد الأقصى للكمية" },
  taxable: { en: "Taxable (joins the room subtotal before service charge, tourism fee and VAT)", ar: "خاضع للضريبة (يُضاف إلى إجمالي الغرفة قبل رسوم الخدمة والسياحة وضريبة القيمة المضافة)" },
  requiresNote: { en: "Ask the guest for a note (time, day, riders…)", ar: "اطلب ملاحظة من النزيل (الوقت، اليوم، عدد الراكبين…)" },
  hintEn: { en: "Note hint (EN)", ar: "تلميح الملاحظة (إنجليزي)" },
  hintAr: { en: "Note hint (AR)", ar: "تلميح الملاحظة (عربي)" },
  image: { en: "Image path", ar: "مسار الصورة" },
  details: { en: "Details (JSON)", ar: "التفاصيل (JSON)" },
  detailsHint: { en: "Free-form facts shown on the website, e.g. {\"length_m\": 310}", ar: "معلومات حرة تُعرض على الموقع، مثل {\"length_m\": 310}" },
  sortOrder: { en: "Sort order", ar: "الترتيب" },
  active: { en: "Active — bookable on the website and the staff form", ar: "نشطة — قابلة للحجز على الموقع ونموذج الموظفين" },
  invalidJson: { en: "Details must be a valid JSON object.", ar: "يجب أن تكون التفاصيل كائن JSON صالحاً." },
} satisfies Strings;

interface Form {
  slug: string;
  kind: string;
  name_en: string;
  name_ar: string;
  tagline_en: string;
  tagline_ar: string;
  description_en: string;
  description_ar: string;
  price_omr: number;
  unit: string;
  max_quantity: number;
  taxable: boolean;
  requires_note: boolean;
  note_hint_en: string;
  note_hint_ar: string;
  image: string;
  details: string;
  is_active: boolean;
  sort_order: number;
}

const EMPTY: Form = {
  slug: "",
  kind: "activity",
  name_en: "",
  name_ar: "",
  tagline_en: "",
  tagline_ar: "",
  description_en: "",
  description_ar: "",
  price_omr: 0,
  unit: "per_person",
  max_quantity: 10,
  taxable: false,
  requires_note: false,
  note_hint_en: "",
  note_hint_ar: "",
  image: "",
  details: "{}",
  is_active: true,
  sort_order: 0,
};

function fromRow(a: AddonRow): Form {
  return {
    slug: a.slug,
    kind: a.kind,
    name_en: a.name_en,
    name_ar: a.name_ar,
    tagline_en: a.tagline_en ?? "",
    tagline_ar: a.tagline_ar ?? "",
    description_en: a.description_en ?? "",
    description_ar: a.description_ar ?? "",
    price_omr: a.price_omr,
    unit: a.unit,
    max_quantity: a.max_quantity,
    taxable: a.taxable,
    requires_note: a.requires_note,
    note_hint_en: a.note_hint_en ?? "",
    note_hint_ar: a.note_hint_ar ?? "",
    image: a.image ?? "",
    details: JSON.stringify(a.details, null, 2),
    is_active: a.is_active,
    sort_order: a.sort_order,
  };
}

/** True when the textarea holds a JSON object (or is empty). */
function detailsValid(text: string): boolean {
  if (text.trim() === "") return true;
  try {
    const v: unknown = JSON.parse(text);
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
  } catch {
    return false;
  }
}

export function AddonDialog({ addon, onClose }: { addon: AddonRow | "new" | null; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  useEffect(() => {
    setError(null);
    setForm(addon && addon !== "new" ? fromRow(addon) : EMPTY);
  }, [addon]);

  if (!addon) return null;
  const isNew = addon === "new";
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const jsonOk = detailsValid(form.details);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!jsonOk) {
      setError("invalid_json");
      return;
    }
    start(async () => {
      const payload = {
        ...form,
        tagline_en: form.tagline_en || null,
        tagline_ar: form.tagline_ar || null,
        description_en: form.description_en || null,
        description_ar: form.description_ar || null,
        note_hint_en: form.note_hint_en || null,
        note_hint_ar: form.note_hint_ar || null,
        image: form.image || null,
        details: form.details.trim(),
      };
      const r = isNew ? await createAddon(payload) : await updateAddon({ id: (addon as AddonRow).id, ...payload });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <Dialog open onClose={onClose} title={isNew ? STR.addTitle[lang] : `${STR.editTitle[lang]} · ${lang === "ar" ? form.name_ar || form.name_en : form.name_en}`} className="max-w-3xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ad-name-en">{STR.nameEn[lang]}</Label>
            <Input id="ad-name-en" value={form.name_en} onChange={(e) => set("name_en", e.target.value)} required autoFocus />
          </div>
          <div>
            <Label htmlFor="ad-name-ar">{STR.nameAr[lang]}</Label>
            <Input id="ad-name-ar" dir="rtl" value={form.name_ar} onChange={(e) => set("name_ar", e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="ad-slug">{STR.slug[lang]}</Label>
            <Input id="ad-slug" dir="ltr" value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
            <p className="mt-1 text-[11px] text-maroon-400">{STR.slugHint[lang]}</p>
          </div>
          <div>
            <Label htmlFor="ad-kind">{COMMON.kind[lang]}</Label>
            <Select id="ad-kind" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {ADDON_KINDS.map((k) => (
                <option key={k} value={k}>
                  {addonKindLabel(k, lang)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ad-price">{STR.price[lang]}</Label>
            <Input id="ad-price" type="number" min={0} step="0.001" dir="ltr" value={form.price_omr} onChange={(e) => set("price_omr", num(e.target.value))} required />
          </div>
          <div>
            <Label htmlFor="ad-unit">{STR.unit[lang]}</Label>
            <Select id="ad-unit" value={form.unit} onChange={(e) => set("unit", e.target.value)}>
              {ADDON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {addonUnitLabel(u, lang)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ad-max">{STR.maxQty[lang]}</Label>
            <Input id="ad-max" type="number" min={1} max={50} value={form.max_quantity} onChange={(e) => set("max_quantity", Math.max(1, Math.round(num(e.target.value))))} required />
          </div>
          <div>
            <Label htmlFor="ad-sort">{STR.sortOrder[lang]}</Label>
            <Input id="ad-sort" type="number" min={0} value={form.sort_order} onChange={(e) => set("sort_order", Math.max(0, Math.round(num(e.target.value))))} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ad-tag-en">{STR.taglineEn[lang]}</Label>
            <Input id="ad-tag-en" value={form.tagline_en} onChange={(e) => set("tagline_en", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ad-tag-ar">{STR.taglineAr[lang]}</Label>
            <Input id="ad-tag-ar" dir="rtl" value={form.tagline_ar} onChange={(e) => set("tagline_ar", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ad-desc-en">{STR.descEn[lang]}</Label>
            <Textarea id="ad-desc-en" rows={3} value={form.description_en} onChange={(e) => set("description_en", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ad-desc-ar">{STR.descAr[lang]}</Label>
            <Textarea id="ad-desc-ar" dir="rtl" rows={3} value={form.description_ar} onChange={(e) => set("description_ar", e.target.value)} />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={form.taxable} onCheckedChange={(v) => set("taxable", v)} label={STR.taxable[lang]} />
            <span className="text-sm text-maroon-800">{STR.taxable[lang]}</span>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={form.requires_note} onCheckedChange={(v) => set("requires_note", v)} label={STR.requiresNote[lang]} />
            <span className="text-sm text-maroon-800">{STR.requiresNote[lang]}</span>
          </div>
          <div>
            <Label htmlFor="ad-hint-en">{STR.hintEn[lang]}</Label>
            <Input id="ad-hint-en" value={form.note_hint_en} onChange={(e) => set("note_hint_en", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ad-hint-ar">{STR.hintAr[lang]}</Label>
            <Input id="ad-hint-ar" dir="rtl" value={form.note_hint_ar} onChange={(e) => set("note_hint_ar", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ad-image">{STR.image[lang]}</Label>
            <Input id="ad-image" dir="ltr" value={form.image} onChange={(e) => set("image", e.target.value)} placeholder="/images/addons/apex-zipline.jpg" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ad-details">{STR.details[lang]}</Label>
            <Textarea
              id="ad-details"
              dir="ltr"
              rows={5}
              className={jsonOk ? "font-mono text-xs" : "font-mono text-xs border-crimson-400 focus:border-crimson-500 focus:ring-crimson-200"}
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              aria-invalid={!jsonOk}
            />
            <p className={jsonOk ? "mt-1 text-[11px] text-maroon-400" : "mt-1 text-[11px] font-semibold text-crimson-700"}>{jsonOk ? STR.detailsHint[lang] : STR.invalidJson[lang]}</p>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} label={STR.active[lang]} />
            <span className="text-sm text-maroon-800">{STR.active[lang]}</span>
          </div>
        </div>
        <InlineAlert kind="error" message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" loading={pending} disabled={!jsonOk}>
            {isNew ? COMMON.add[lang] : COMMON.save[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
