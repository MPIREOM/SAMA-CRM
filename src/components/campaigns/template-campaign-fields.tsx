"use client";

import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import type { Lang, Strings } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { uploadCampaignMedia } from "@/app/(crm)/(app)/templates/actions";
import { marketingPackHeaderUrl } from "@/lib/messaging/templates/marketing-pack";
import { TemplatePreview } from "@/components/admin/templates/template-preview";
import {
  PARAM_FIELDS,
  defaultPlan,
  planIssues,
  renderMetaTemplate,
  resolveParam,
  templateShape,
  type MetaTemplateSummary,
  type ParamField,
  type ParamSource,
  type TemplateParamPlan,
} from "@/lib/messaging/meta-template-model";

const STR = {
  template: { en: "Approved template", ar: "القالب المعتمد" },
  pick: { en: "Choose a template…", ar: "اختاروا قالباً…" },
  none: { en: "No approved marketing template yet — create one under Templates.", ar: "لا يوجد قالب تسويقي معتمد بعد — أنشئوا واحداً من صفحة القوالب." },
  languages: { en: "Sent in the guest's language when that version is approved, otherwise English.", ar: "يُرسل بلغة النزيل عند اعتماد تلك النسخة، وإلا بالإنجليزية." },
  headerMedia: { en: "Header media", ar: "وسائط الترويسة" },
  headerMediaHint: { en: "The image, video or PDF guests receive at the top of this campaign.", ar: "الصورة أو الفيديو أو ملف PDF الذي يستلمه النزلاء أعلى هذه الحملة." },
  headerVar: { en: "Header variable {{1}}", ar: "متغير الترويسة {{1}}" },
  variables: { en: "Variables", ar: "المتغيرات" },
  button: { en: "Button link suffix", ar: "لاحقة رابط الزر" },
  custom: { en: "Custom text", ar: "نص مخصص" },
  fieldName: { en: "Guest's full name", ar: "اسم النزيل الكامل" },
  fieldFirst: { en: "Guest's first name", ar: "الاسم الأول للنزيل" },
  fieldRoom: { en: "Last room type", ar: "آخر نوع غرفة" },
  fieldTerms: { en: "Terms link", ar: "رابط الشروط" },
  preview: { en: "Preview (sample guest: Ahmed Al Nabhani)", ar: "معاينة (نزيل تجريبي: أحمد النبهاني)" },
} satisfies Strings;

const FIELD_LABEL: Record<ParamField, keyof typeof STR> = { name: "fieldName", first_name: "fieldFirst", room_type: "fieldRoom", terms_link: "fieldTerms" };

const SAMPLE = { name: "Ahmed Al Nabhani", room_type: "Chalet", terms_link: "https://sama-crm.vercel.app/terms" };

export interface TemplateSelection {
  name: string;
  plan: TemplateParamPlan;
}

function SourcePicker({ id, value, onChange, lang }: { id: string; value: ParamSource | undefined; onChange: (s: ParamSource) => void; lang: Lang }) {
  const kind = value?.kind === "field" ? value.field : "text";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        id={id}
        value={kind}
        className="h-9 w-48 text-sm"
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "text" ? { kind: "text", value: value?.kind === "text" ? value.value : "" } : { kind: "field", field: v as ParamField });
        }}
      >
        {PARAM_FIELDS.map((f) => (
          <option key={f} value={f}>
            {STR[FIELD_LABEL[f]][lang]}
          </option>
        ))}
        <option value="text">{STR.custom[lang]}</option>
      </Select>
      {value?.kind === "text" && <Input value={value.value} onChange={(e) => onChange({ kind: "text", value: e.target.value })} className="h-9 min-w-[12rem] flex-1 text-sm" />}
    </div>
  );
}

/**
 * The template half of the campaign composer: pick an approved template,
 * decide how each variable is filled per guest, upload header media, preview.
 */
export function TemplateCampaignFields({
  templates,
  value,
  onChange,
  onError,
  lang,
}: {
  templates: MetaTemplateSummary[];
  value: TemplateSelection | null;
  onChange: (v: TemplateSelection | null) => void;
  onError: (message: string | null) => void;
  lang: Lang;
}) {
  const [uploading, setUploading] = useState(false);

  const approved = useMemo(() => templates.filter((t) => t.status === "APPROVED"), [templates]);
  const names = useMemo(() => Array.from(new Set(approved.map((t) => t.name))).sort(), [approved]);
  const variants = useMemo(() => (value ? approved.filter((t) => t.name === value.name) : []), [approved, value]);
  const primary = variants.find((v) => v.language.startsWith("en")) ?? variants[0] ?? null;
  const shape = primary ? templateShape(primary) : null;
  const issues = shape && value ? planIssues(shape, value.plan) : [];

  function select(name: string) {
    const first = approved.find((t) => t.name === name);
    if (!first) return onChange(null);
    const plan = defaultPlan(templateShape(first));
    // Pack templates ship with their header photo on this deployment — no upload needed.
    const packHeader = marketingPackHeaderUrl(name, process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : ""));
    if (packHeader) plan.headerMediaUrl = packHeader;
    onChange({ name, plan });
  }

  function patchPlan(patch: Partial<TemplateParamPlan>) {
    if (!value) return;
    onChange({ ...value, plan: { ...value.plan, ...patch } });
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    onError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadCampaignMedia(fd);
      if (!r.ok) onError(r.error);
      else patchPlan({ headerMediaUrl: r.data.url });
    } finally {
      setUploading(false);
    }
  }

  const preview = useMemo(() => {
    if (!primary || !value || !shape) return null;
    return renderMetaTemplate(primary, {
      header: shape.headerVars > 0 ? resolveParam(value.plan.headerText, SAMPLE) : undefined,
      body: Array.from({ length: shape.bodyVars }, (_v, i) => resolveParam(value.plan.body[i], SAMPLE)),
      buttonUrls: Object.fromEntries(shape.dynamicUrlButtons.map((i) => [i, resolveParam(value.plan.buttonUrls[String(i)], SAMPLE)])),
      mediaUrl: value.plan.headerMediaUrl,
    });
  }, [primary, value, shape]);

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="campaign-template">{STR.template[lang]}</Label>
        {names.length === 0 ? (
          <p className="text-sm text-crimson-700">{STR.none[lang]}</p>
        ) : (
          <>
            <Select id="campaign-template" value={value?.name ?? ""} onChange={(e) => select(e.target.value)}>
              <option value="">{STR.pick[lang]}</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            {variants.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-maroon-500">
                {variants.map((v) => (
                  <Badge key={v.id} variant="green">
                    {v.language}
                  </Badge>
                ))}
                <span>{STR.languages[lang]}</span>
              </div>
            )}
          </>
        )}
      </div>

      {value && shape && (
        <>
          {shape.headerFormat !== "NONE" && shape.headerFormat !== "TEXT" && (
            <div>
              <Label htmlFor="campaign-media">{STR.headerMedia[lang]}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="campaign-media"
                  type="file"
                  accept={shape.headerFormat === "IMAGE" ? "image/jpeg,image/png" : shape.headerFormat === "VIDEO" ? "video/mp4" : "application/pdf"}
                  className="text-sm"
                  disabled={uploading}
                  onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
                />
                {uploading && <Upload className="h-4 w-4 animate-pulse text-maroon-400" aria-hidden="true" />}
                {value.plan.headerMediaUrl && (
                  <a href={value.plan.headerMediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-maroon-700 underline" dir="ltr">
                    {value.plan.headerMediaUrl.split("/").pop()}
                  </a>
                )}
              </div>
              <p className="mt-1 text-xs text-maroon-400">{STR.headerMediaHint[lang]}</p>
            </div>
          )}

          {shape.headerVars > 0 && (
            <div>
              <Label htmlFor="campaign-header-var">{STR.headerVar[lang]}</Label>
              <SourcePicker id="campaign-header-var" value={value.plan.headerText} onChange={(s) => patchPlan({ headerText: s })} lang={lang} />
            </div>
          )}

          {shape.bodyVars > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.variables[lang]}</p>
              <div className="space-y-2">
                {Array.from({ length: shape.bodyVars }, (_v, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <code className="w-12 text-xs text-maroon-500" dir="ltr">{`{{${i + 1}}}`}</code>
                    <SourcePicker
                      id={`campaign-var-${i}`}
                      value={value.plan.body[i]}
                      onChange={(s) => {
                        const body = [...value.plan.body];
                        body[i] = s;
                        patchPlan({ body });
                      }}
                      lang={lang}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {shape.dynamicUrlButtons.map((i) => (
            <div key={i}>
              <Label htmlFor={`campaign-btn-${i}`}>
                {STR.button[lang]} #{i + 1}
              </Label>
              <SourcePicker id={`campaign-btn-${i}`} value={value.plan.buttonUrls[String(i)]} onChange={(s) => patchPlan({ buttonUrls: { ...value.plan.buttonUrls, [String(i)]: s } })} lang={lang} />
            </div>
          ))}

          {issues.length > 0 && (
            <ul className="list-disc space-y-0.5 ps-5 text-sm text-crimson-700">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}

          {preview && primary && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.preview[lang]}</p>
              <TemplatePreview rendered={preview} rtl={primary.language.toLowerCase().startsWith("ar")} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
