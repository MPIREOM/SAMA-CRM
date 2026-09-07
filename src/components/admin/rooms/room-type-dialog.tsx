"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkRoomType } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { setRoomTypeImages, updateRoomType, uploadRoomTypeImage } from "@/app/(crm)/(app)/rooms/actions";
import { InlineAlert } from "../load-error";
import { AMENITIES } from "../shared";

export type RoomTypeRow = Omit<BkRoomType, "base_rate_omr" | "size_sqm" | "amenities"> & {
  base_rate_omr: number;
  size_sqm: number | null;
  amenities: string[];
};

const STR = {
  title: { en: "Edit room type", ar: "تعديل نوع الغرفة" },
  nameEn: { en: "Name (EN)", ar: "الاسم (إنجليزي)" },
  nameAr: { en: "Name (AR)", ar: "الاسم (عربي)" },
  taglineEn: { en: "Tagline (EN)", ar: "الوصف المختصر (إنجليزي)" },
  taglineAr: { en: "Tagline (AR)", ar: "الوصف المختصر (عربي)" },
  descEn: { en: "Description (EN)", ar: "الوصف (إنجليزي)" },
  descAr: { en: "Description (AR)", ar: "الوصف (عربي)" },
  viewEn: { en: "View (EN)", ar: "الإطلالة (إنجليزي)" },
  viewAr: { en: "View (AR)", ar: "الإطلالة (عربي)" },
  bedEn: { en: "Bed config (EN)", ar: "الأسرّة (إنجليزي)" },
  bedAr: { en: "Bed config (AR)", ar: "الأسرّة (عربي)" },
  size: { en: "Size (m²)", ar: "المساحة (م²)" },
  maxAdults: { en: "Max adults", ar: "الحد الأقصى للبالغين" },
  maxChildren: { en: "Max children", ar: "الحد الأقصى للأطفال" },
  baseRate: { en: "Base rate (OMR / night)", ar: "السعر الأساسي (ر.ع / ليلة)" },
  sortOrder: { en: "Sort order", ar: "الترتيب" },
  active: { en: "Active on the website", ar: "معروض على الموقع" },
  amenities: { en: "Amenities", ar: "المرافق" },
  images: { en: "Photos", ar: "الصور" },
  upload: { en: "Upload photo", ar: "رفع صورة" },
  uploading: { en: "Uploading…", ar: "جارٍ الرفع…" },
  noImages: { en: "No photos yet", ar: "لا توجد صور بعد" },
  saveOrder: { en: "Save photo order", ar: "حفظ ترتيب الصور" },
  saved: { en: "Saved", ar: "تم الحفظ" },
} satisfies Strings;

export function RoomTypeDialog({ type, onClose }: { type: RoomTypeRow | null; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<RoomTypeRow | null>(type);
  const [images, setImages] = useState<string[]>(type?.images ?? []);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(type);
    setImages(type?.images ?? []);
    setError(null);
    setNotice(null);
  }, [type]);

  if (!type || !form) return null;
  const f = form;
  const set = <K extends keyof RoomTypeRow>(key: K, value: RoomTypeRow[K]) => setForm({ ...f, [key]: value });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await updateRoomType({
        id: f.id,
        name_en: f.name_en,
        name_ar: f.name_ar,
        tagline_en: f.tagline_en || null,
        tagline_ar: f.tagline_ar || null,
        description_en: f.description_en || null,
        description_ar: f.description_ar || null,
        view_en: f.view_en || null,
        view_ar: f.view_ar || null,
        bed_config_en: f.bed_config_en || null,
        bed_config_ar: f.bed_config_ar || null,
        size_sqm: f.size_sqm,
        max_adults: f.max_adults,
        max_children: f.max_children,
        amenities: f.amenities,
        base_rate_omr: f.base_rate_omr,
        sort_order: f.sort_order,
        is_active: f.is_active,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  async function upload(file: File) {
    setError(null);
    setNotice(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("room_type_id", f.id);
    fd.append("file", file);
    const r = await uploadRoomTypeImage(fd);
    setUploading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setImages((imgs) => [...imgs, r.data.url]);
    router.refresh();
  }

  function saveImages(next: string[]) {
    setImages(next);
    setError(null);
    start(async () => {
      const r = await setRoomTypeImages({ id: f.id, images: next });
      if (!r.ok) setError(r.error);
      else {
        setNotice(STR.saved[lang]);
        router.refresh();
      }
    });
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...images];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    saveImages(next);
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <Dialog open onClose={onClose} title={`${STR.title[lang]} · ${lang === "ar" ? type.name_ar : type.name_en}`} className="max-w-3xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="rt-name-en">{STR.nameEn[lang]}</Label>
            <Input id="rt-name-en" value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="rt-name-ar">{STR.nameAr[lang]}</Label>
            <Input id="rt-name-ar" dir="rtl" value={f.name_ar} onChange={(e) => set("name_ar", e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="rt-tag-en">{STR.taglineEn[lang]}</Label>
            <Input id="rt-tag-en" value={f.tagline_en ?? ""} onChange={(e) => set("tagline_en", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rt-tag-ar">{STR.taglineAr[lang]}</Label>
            <Input id="rt-tag-ar" dir="rtl" value={f.tagline_ar ?? ""} onChange={(e) => set("tagline_ar", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rt-desc-en">{STR.descEn[lang]}</Label>
            <Textarea id="rt-desc-en" rows={4} value={f.description_en ?? ""} onChange={(e) => set("description_en", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rt-desc-ar">{STR.descAr[lang]}</Label>
            <Textarea id="rt-desc-ar" dir="rtl" rows={4} value={f.description_ar ?? ""} onChange={(e) => set("description_ar", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rt-view-en">{STR.viewEn[lang]}</Label>
            <Input id="rt-view-en" value={f.view_en ?? ""} onChange={(e) => set("view_en", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rt-view-ar">{STR.viewAr[lang]}</Label>
            <Input id="rt-view-ar" dir="rtl" value={f.view_ar ?? ""} onChange={(e) => set("view_ar", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rt-bed-en">{STR.bedEn[lang]}</Label>
            <Input id="rt-bed-en" value={f.bed_config_en ?? ""} onChange={(e) => set("bed_config_en", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rt-bed-ar">{STR.bedAr[lang]}</Label>
            <Input id="rt-bed-ar" dir="rtl" value={f.bed_config_ar ?? ""} onChange={(e) => set("bed_config_ar", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <Label htmlFor="rt-size">{STR.size[lang]}</Label>
            <Input id="rt-size" type="number" step="0.1" min={0} value={f.size_sqm ?? ""} onChange={(e) => set("size_sqm", e.target.value === "" ? null : Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="rt-adults">{STR.maxAdults[lang]}</Label>
            <Input id="rt-adults" type="number" min={1} max={10} value={f.max_adults} onChange={(e) => set("max_adults", num(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="rt-children">{STR.maxChildren[lang]}</Label>
            <Input id="rt-children" type="number" min={0} max={10} value={f.max_children} onChange={(e) => set("max_children", num(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="rt-rate">{STR.baseRate[lang]}</Label>
            <Input id="rt-rate" type="number" step="0.001" min={0} value={f.base_rate_omr} onChange={(e) => set("base_rate_omr", num(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="rt-sort">{STR.sortOrder[lang]}</Label>
            <Input id="rt-sort" type="number" min={0} value={f.sort_order} onChange={(e) => set("sort_order", num(e.target.value))} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} label={STR.active[lang]} />
          <span className="text-sm font-semibold text-maroon-800">{STR.active[lang]}</span>
        </div>

        <div>
          <Label>{STR.amenities[lang]}</Label>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4">
            {AMENITIES.map((a) => (
              <Checkbox
                key={a.key}
                label={a[lang]}
                checked={f.amenities.includes(a.key)}
                onChange={(e) =>
                  set("amenities", e.target.checked ? [...f.amenities, a.key] : f.amenities.filter((k) => k !== a.key))
                }
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">{STR.images[lang]}</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              aria-label={STR.upload[lang]}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
            <Button type="button" size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              {uploading ? STR.uploading[lang] : STR.upload[lang]}
            </Button>
          </div>
          {images.length === 0 ? (
            <p className="text-sm text-maroon-400">{STR.noImages[lang]}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {images.map((src, i) => (
                <li key={`${src}-${i}`} className="group relative overflow-hidden rounded-lg border border-maroon-100 bg-maroon-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="aspect-[4/3] w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-maroon-950/60 p-1">
                    <button type="button" className="rounded p-1 text-gold-100 hover:bg-maroon-800 disabled:opacity-30" disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label="Up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="rounded p-1 text-gold-100 hover:bg-maroon-800 disabled:opacity-30" disabled={i === images.length - 1 || pending} onClick={() => move(i, 1)} aria-label="Down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="rounded p-1 text-crimson-300 hover:bg-maroon-800" disabled={pending} onClick={() => saveImages(images.filter((_, j) => j !== i))} aria-label={COMMON.remove[lang]}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <InlineAlert kind="error" message={error} />
        <InlineAlert kind="success" message={notice} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" loading={pending}>
            {COMMON.save[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
