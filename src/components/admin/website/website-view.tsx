"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Image as ImageIcon, RotateCcw, Upload } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SITE_COPY_FIELDS,
  SITE_IMAGE_SLOTS,
  SITE_PAGES,
  SITE_SECTION_TOGGLES,
  siteImage,
  siteSectionShown,
  type SiteImageSlot,
  type SitePage,
  type SiteSettings,
} from "@/lib/bk/site-content";
import { SITE_LIBRARY } from "@/lib/bk/site-library";
import { saveSiteCopy, saveSiteSections, setSiteImage, uploadSiteImage } from "@/app/(crm)/(app)/website/actions";
import { InlineAlert } from "../load-error";

const STR = {
  subtitle: { en: "Every photo, the hero copy and the optional sections of the guest website. Changes are live on the next page load.", ar: "كل صورة، ونص الواجهة، والأقسام الاختيارية في موقع النزلاء. تظهر التغييرات مع التحميل التالي للصفحة." },
  photos: { en: "Photos", ar: "الصور" },
  copy: { en: "Words", ar: "النصوص" },
  sections: { en: "Sections", ar: "الأقسام" },
  openSite: { en: "Open the website", ar: "فتح الموقع" },
  replace: { en: "Upload", ar: "رفع صورة" },
  uploading: { en: "Uploading…", ar: "جارٍ الرفع…" },
  library: { en: "Library", ar: "المكتبة" },
  reset: { en: "Default", ar: "الافتراضي" },
  custom: { en: "Custom", ar: "مخصصة" },
  default: { en: "Default photo", ar: "الصورة الافتراضية" },
  usesAddon: { en: "Uses the add-on's image", ar: "تستخدم صورة الإضافة" },
  ratio: { en: "Best as", ar: "الأفضل بنسبة" },
  libraryTitle: { en: "Choose from the hotel photos", ar: "اختيار من صور الفندق" },
  libraryHint: { en: "Photos already on the site. Upload if you want something new.", ar: "الصور الموجودة على الموقع. ارفعوا صورة إن أردتم صورة جديدة." },
  groupHotel: { en: "Hotel", ar: "الفندق" },
  groupRooms: { en: "Rooms", ar: "الغرف" },
  groupAddons: { en: "Add-ons", ar: "الإضافات" },
  copyHint: { en: "Leave a field empty to keep the built-in text (shown in grey). Both languages are shown side by side.", ar: "اتركوا الحقل فارغاً للإبقاء على النص الأصلي (يظهر باللون الرمادي). تُعرض اللغتان جنباً إلى جنب." },
  english: { en: "English", ar: "الإنجليزية" },
  arabic: { en: "Arabic", ar: "العربية" },
  sectionsHint: { en: "Switch a section off to hide it from the home page. Rooms and the booking bar always show.", ar: "أوقفوا القسم لإخفائه من الصفحة الرئيسية. الغرف وشريط الحجز يظهران دائماً." },
  saved: { en: "Saved", ar: "تم الحفظ" },
  roomPhotos: { en: "Room photos are managed under Rooms → Room types; add-on photos under Add-ons.", ar: "تُدار صور الغرف من صفحة الغرف ← أنواع الغرف، وصور الإضافات من صفحة الإضافات." },
} satisfies Strings;

const RATIO_LABEL: Record<SiteImageSlot["ratio"], string> = {
  "16:9": "16 : 9",
  "4:3": "4 : 3",
  "3:2": "3 : 2",
  "1:1": "1 : 1",
  "3:4": "3 : 4 (portrait)",
  wide: "3 : 1 (wide)",
};

const RATIO_CLASS: Record<SiteImageSlot["ratio"], string> = {
  "16:9": "aspect-video",
  "4:3": "aspect-[4/3]",
  "3:2": "aspect-[3/2]",
  "1:1": "aspect-square",
  "3:4": "aspect-[3/4]",
  wide: "aspect-[3/1]",
};

export function WebsiteView({ site, placeholders, siteUrl }: { site: SiteSettings; placeholders: Record<string, string>; siteUrl: string }) {
  const { lang } = useLang();
  const [tab, setTab] = useState<"photos" | "copy" | "sections">("photos");

  const tabs = [
    ["photos", STR.photos[lang]],
    ["copy", STR.copy[lang]],
    ["sections", STR.sections[lang]],
  ] as const;

  return (
    <div>
      <PageHeader
        title={COMMON.website[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <a href={`${siteUrl || ""}/${lang}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-maroon-200 bg-white px-4 text-sm font-semibold text-maroon-800 hover:bg-maroon-50">
            <ExternalLink className="h-4 w-4" />
            {STR.openSite[lang]}
          </a>
        }
      />

      <div className="mb-6 flex gap-1 border-b border-maroon-100" role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === key ? "border-gold-500 text-maroon-900" : "border-transparent text-maroon-400 hover:text-maroon-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "photos" && <PhotosTab site={site} />}
      {tab === "copy" && <CopyTab site={site} placeholders={placeholders} />}
      {tab === "sections" && <SectionsTab site={site} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

function PhotosTab({ site }: { site: SiteSettings }) {
  const { lang } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<SiteImageSlot | null>(null);
  const pages = SITE_PAGES.filter((p) => SITE_IMAGE_SLOTS.some((s) => s.page === p.key));

  return (
    <div className="space-y-8">
      <InlineAlert kind="error" message={error} />
      <p className="text-sm text-maroon-500">{STR.roomPhotos[lang]}</p>
      {pages.map((page) => (
        <section key={page.key} aria-labelledby={`site-page-${page.key}`}>
          <h2 id={`site-page-${page.key}`} className="mb-3 text-xs font-bold uppercase tracking-wider text-maroon-400">
            {page.label[lang]}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SITE_IMAGE_SLOTS.filter((s) => s.page === page.key).map((slot) => (
              <SlotCard key={slot.key} slot={slot} site={site} onError={setError} onPick={() => setPicker(slot)} />
            ))}
          </div>
        </section>
      ))}
      {picker && <LibraryPicker slot={picker} onClose={() => setPicker(null)} onError={setError} />}
    </div>
  );
}

function SlotCard({ slot, site, onError, onPick }: { slot: SiteImageSlot; site: SiteSettings; onError: (m: string | null) => void; onPick: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const custom = Boolean(site.images[slot.key]);
  const src = siteImage(site, slot.key as never);

  async function upload(file: File) {
    onError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("key", slot.key);
    fd.append("file", file);
    const r = await uploadSiteImage(fd);
    setUploading(false);
    if (!r.ok) onError(r.error);
    else router.refresh();
  }

  function reset() {
    onError(null);
    start(async () => {
      const r = await setSiteImage({ key: slot.key, src: "" });
      if (!r.ok) onError(r.error);
      else router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className={cn("relative bg-maroon-50", RATIO_CLASS[slot.ratio])}>
        {src ? (
          <Image src={src} alt="" fill sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-maroon-300">
            <ImageIcon className="h-6 w-6" />
            <span className="text-xs">{STR.usesAddon[lang]}</span>
          </div>
        )}
        <span className={cn("absolute start-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", custom ? "bg-gold-500 text-maroon-950" : "bg-white/85 text-maroon-600")}>
          {custom ? STR.custom[lang] : STR.default[lang]}
        </span>
      </div>
      <CardContent className="space-y-2 py-3">
        <p className="text-sm font-bold text-maroon-900">{slot.label[lang]}</p>
        {slot.hint && <p className="text-xs leading-relaxed text-maroon-500">{slot.hint[lang]}</p>}
        <p className="text-[11px] text-maroon-400">
          {STR.ratio[lang]} {RATIO_LABEL[slot.ratio]}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            aria-label={`${STR.replace[lang]} — ${slot.label[lang]}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <Button type="button" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? STR.uploading[lang] : STR.replace[lang]}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onPick} disabled={pending || uploading}>
            <ImageIcon className="h-3.5 w-3.5" />
            {STR.library[lang]}
          </Button>
          {custom && (
            <Button type="button" size="sm" variant="ghost" onClick={reset} loading={pending}>
              <RotateCcw className="h-3.5 w-3.5" />
              {STR.reset[lang]}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LibraryPicker({ slot, onClose, onError }: { slot: SiteImageSlot; onClose: () => void; onError: (m: string | null) => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [group, setGroup] = useState<"hotel" | "rooms" | "addons">("hotel");
  const groups = [
    ["hotel", STR.groupHotel[lang]],
    ["rooms", STR.groupRooms[lang]],
    ["addons", STR.groupAddons[lang]],
  ] as const;

  function choose(src: string) {
    onError(null);
    start(async () => {
      const r = await setSiteImage({ key: slot.key, src });
      if (!r.ok) onError(r.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <Dialog open onClose={onClose} title={`${STR.libraryTitle[lang]} · ${slot.label[lang]}`} className="max-w-4xl">
      <p className="mb-3 text-sm text-maroon-500">{STR.libraryHint[lang]}</p>
      <div className="mb-4 flex gap-1">
        {groups.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setGroup(key)}
            className={cn("rounded-full px-3 py-1 text-xs font-bold", group === key ? "bg-maroon-800 text-gold-100" : "bg-maroon-50 text-maroon-600 hover:bg-maroon-100")}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5", pending && "pointer-events-none opacity-60")}>
        {SITE_LIBRARY.filter((i) => i.group === group).map((item) => (
          <li key={item.src}>
            <button
              type="button"
              onClick={() => choose(item.src)}
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border border-maroon-100 bg-maroon-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              title={item.src}
            >
              <Image src={item.src} alt="" fill sizes="200px" className="object-cover transition-transform duration-300 group-hover:scale-105" />
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function CopyTab({ site, placeholders }: { site: SiteSettings; placeholders: Record<string, string> }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of SITE_COPY_FIELDS) {
      init[`${f.key}_en`] = site.copy[`${f.key}_en`] ?? "";
      init[`${f.key}_ar`] = site.copy[`${f.key}_ar`] ?? "";
    }
    return init;
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await saveSiteCopy(form);
      if (!r.ok) setError(r.error);
      else {
        setNotice(STR.saved[lang]);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{STR.copy[lang]}</CardTitle>
        <p className="mt-1 text-sm text-maroon-500">{STR.copyHint[lang]}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          {SITE_PAGES.filter((p) => SITE_COPY_FIELDS.some((f) => f.page === p.key)).map((page) => (
            <section key={page.key} className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-maroon-400">{page.label[lang]}</h3>
              {SITE_COPY_FIELDS.filter((f) => f.page === page.key).map((f) => (
            <fieldset key={f.key} className="rounded-lg border border-maroon-100 p-3">
              <legend className="px-1 text-sm font-bold text-maroon-900">{f.label[lang]}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["en", "ar"] as const).map((l) => {
                  const id = `copy-${f.key}-${l}`;
                  const key = `${f.key}_${l}`;
                  const common = {
                    id,
                    dir: l === "ar" ? ("rtl" as const) : ("ltr" as const),
                    value: form[key] ?? "",
                    placeholder: placeholders[key] || undefined,
                    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((s) => ({ ...s, [key]: e.target.value })),
                  };
                  return (
                    <div key={l}>
                      <Label htmlFor={id} className="text-xs">
                        {l === "en" ? STR.english[lang] : STR.arabic[lang]}
                      </Label>
                      {f.multiline ? <Textarea rows={3} {...common} /> : <Input {...common} />}
                    </div>
                  );
                })}
              </div>
            </fieldset>
              ))}
            </section>
          ))}
          <InlineAlert kind="error" message={error} />
          <InlineAlert kind="success" message={notice} />
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              {COMMON.save[lang]}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SectionsTab({ site }: { site: SiteSettings }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of SITE_SECTION_TOGGLES) init[s.key] = siteSectionShown(site, s.key);
    return init;
  });

  function toggle(key: string, value: boolean) {
    const next = { ...state, [key]: value };
    setState(next);
    setError(null);
    start(async () => {
      const r = await saveSiteSections(next);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{STR.sections[lang]}</CardTitle>
        <p className="mt-1 text-sm text-maroon-500">{STR.sectionsHint[lang]}</p>
      </CardHeader>
      <CardContent className="divide-y divide-maroon-100">
        <InlineAlert kind="error" message={error} />
        {SITE_SECTION_TOGGLES.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-center justify-between gap-4 py-3 text-sm text-maroon-800">
            <span>{s.label[lang]}</span>
            <Switch checked={state[s.key]} onCheckedChange={(v) => toggle(s.key, v)} label={s.label[lang]} disabled={pending} />
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
