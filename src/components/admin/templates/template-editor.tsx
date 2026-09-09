"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Send, Trash2, Upload } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { type Strings } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveMetaTemplate, uploadTemplateMedia } from "@/app/(crm)/(app)/templates/actions";
import {
  EDITABLE_STATUSES,
  HEADER_FORMATS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  bodyVariableCount,
  headerHasVariable,
  renderDraft,
  urlHasSuffix,
  validateDraft,
  type ButtonKind,
  type HeaderFormat,
  type TemplateDraft,
} from "@/lib/messaging/meta-template-model";
import { InlineAlert } from "../load-error";
import { TemplatePreview } from "./template-preview";

const STR = {
  createTitle: { en: "New template", ar: "قالب جديد" },
  editTitle: { en: "Edit template", ar: "تعديل القالب" },
  subtitle: { en: "Meta reviews the template after you submit; sending is possible once it is APPROVED.", ar: "تراجع Meta القالب بعد الإرسال؛ يمكن الإرسال بعد أن تصبح حالته APPROVED." },
  back: { en: "Back to templates", ar: "العودة إلى القوالب" },
  basics: { en: "Basics", ar: "الأساسيات" },
  name: { en: "Name", ar: "الاسم" },
  nameHint: { en: "Lowercase letters, digits and underscores, e.g. eid_weekend_offer. Cannot be changed later.", ar: "أحرف صغيرة وأرقام وشرطات سفلية فقط، مثل eid_weekend_offer. لا يمكن تغييره لاحقاً." },
  language: { en: "Language", ar: "اللغة" },
  category: { en: "Category", ar: "الفئة" },
  categoryHint: { en: "Marketing: offers and news. Utility: updates about a booking. Meta may re-categorise marketing content automatically.", ar: "تسويقي: العروض والأخبار. خدمي: تحديثات عن الحجز. قد تعيد Meta تصنيف المحتوى التسويقي تلقائياً." },
  header: { en: "Header (optional)", ar: "الترويسة (اختياري)" },
  headerFormat: { en: "Type", ar: "النوع" },
  headerText: { en: "Header text", ar: "نص الترويسة" },
  headerTextHint: { en: "Up to 60 characters, at most one variable {{1}}.", ar: "حتى 60 حرفاً، ومتغير واحد على الأكثر {{1}}." },
  headerExample: { en: "Example for {{1}}", ar: "مثال لـ {{1}}" },
  media: { en: "Media file", ar: "ملف الوسائط" },
  mediaHint: { en: "JPEG/PNG image, MP4 video or PDF, up to 16 MB. Uploaded to Meta as the review sample and kept as the default media for campaigns.", ar: "صورة JPEG/PNG أو فيديو MP4 أو PDF حتى 16 ميغابايت. يُرفع إلى Meta كعينة للمراجعة ويُحفظ كوسائط افتراضية للحملات." },
  mediaUploaded: { en: "Uploaded — sample handle received from Meta.", ar: "تم الرفع — تم استلام معرّف العينة من Meta." },
  mediaKeep: { en: "Current media is kept unless you upload a new file.", ar: "تُحفظ الوسائط الحالية ما لم ترفعوا ملفاً جديداً." },
  noAppId: { en: "Media headers need the Meta app id. Enter it on the WhatsApp setup page first.", ar: "تحتاج ترويسات الوسائط إلى معرّف تطبيق Meta. أدخلوه في صفحة إعداد واتساب أولاً." },
  upload: { en: "Upload", ar: "رفع" },
  body: { en: "Body", ar: "النص" },
  bodyHint: { en: "Up to 1024 characters. Insert variables as {{1}}, {{2}}, … and give an example for each. *bold* and _italic_ work.", ar: "حتى 1024 حرفاً. أدرجوا المتغيرات كـ {{1}} و{{2}} … مع مثال لكل منها. يمكن استخدام *غامق* و_مائل_." },
  addVariable: { en: "Add variable", ar: "إضافة متغير" },
  examples: { en: "Example values (what Meta's reviewers see)", ar: "أمثلة القيم (ما يراه مراجعو Meta)" },
  footer: { en: "Footer (optional)", ar: "التذييل (اختياري)" },
  footerHint: { en: "Up to 60 characters, e.g. an opt-out line.", ar: "حتى 60 حرفاً، مثل سطر إلغاء الاشتراك." },
  buttons: { en: "Buttons (optional)", ar: "الأزرار (اختياري)" },
  addQuick: { en: "Quick reply", ar: "رد سريع" },
  addUrl: { en: "Website", ar: "موقع" },
  addPhone: { en: "Call", ar: "اتصال" },
  buttonText: { en: "Label", ar: "النص" },
  buttonUrl: { en: "Address (may end with {{1}} for a per-guest suffix)", ar: "العنوان (يمكن أن ينتهي بـ {{1}} لإضافة لاحقة لكل نزيل)" },
  buttonUrlExample: { en: "Example suffix", ar: "مثال اللاحقة" },
  buttonPhone: { en: "Phone (+968…)", ar: "الهاتف (+968…)" },
  remove: { en: "Remove", ar: "إزالة" },
  preview: { en: "Preview", ar: "المعاينة" },
  issues: { en: "Before submitting", ar: "قبل الإرسال" },
  submitCreate: { en: "Submit to Meta", ar: "إرسال إلى Meta" },
  submitEdit: { en: "Save & resubmit", ar: "حفظ وإعادة الإرسال" },
  created: { en: "Submitted. Meta's review usually takes minutes.", ar: "تم الإرسال. تستغرق مراجعة Meta دقائق عادةً." },
  notEditable: { en: "Only approved, rejected or paused templates can be edited. Wait for Meta's review to finish.", ar: "يمكن تعديل القوالب المعتمدة أو المرفوضة أو الموقوفة فقط. انتظروا انتهاء مراجعة Meta." },
  editLimits: { en: "Approved templates can be edited 10 times per 30 days; each edit is reviewed again. Name and language cannot change.", ar: "يمكن تعديل القوالب المعتمدة 10 مرات كل 30 يوماً؛ تُراجع كل تعديل مجدداً. لا يمكن تغيير الاسم أو اللغة." },
  rejectedReason: { en: "Meta's rejection reason", ar: "سبب الرفض من Meta" },
} satisfies Strings;

interface Props {
  mode: "create" | "edit";
  templateId?: string;
  status?: string;
  rejectedReason?: string | null;
  initial: TemplateDraft;
  appIdKnown: boolean;
}

export function TemplateEditor({ mode, templateId, status, rejectedReason, initial, appIdKnown }: Props) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const bodyVars = bodyVariableCount(draft.body);
  const issues = useMemo(() => validateDraft(draft), [draft]);
  const rendered = useMemo(() => renderDraft(draft), [draft]);
  const rtl = draft.language.toLowerCase().startsWith("ar");
  const editable = mode === "create" || (status ? EDITABLE_STATUSES.includes(status) : true);

  function update(patch: Partial<TemplateDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function setBody(body: string) {
    const n = bodyVariableCount(body);
    setDraft((d) => {
      const examples = d.bodyExamples.slice(0, n);
      while (examples.length < n) examples.push("");
      return { ...d, body, bodyExamples: examples };
    });
  }

  function addVariable() {
    const el = bodyRef.current;
    const token = `{{${bodyVars + 1}}}`;
    if (!el) return setBody(draft.body + token);
    const start = el.selectionStart ?? draft.body.length;
    const end = el.selectionEnd ?? draft.body.length;
    setBody(draft.body.slice(0, start) + token + draft.body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function setExample(i: number, value: string) {
    setDraft((d) => {
      const examples = [...d.bodyExamples];
      examples[i] = value;
      return { ...d, bodyExamples: examples };
    });
  }

  function addButton(type: ButtonKind) {
    update({ buttons: [...draft.buttons, { type, text: "", url: type === "URL" ? "https://" : undefined, phone_number: type === "PHONE_NUMBER" ? "+968" : undefined }] });
  }

  function updateButton(i: number, patch: Partial<TemplateDraft["buttons"][number]>) {
    update({ buttons: draft.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadTemplateMedia(fd);
      if (!r.ok) setError(r.error);
      else update({ header: { ...draft.header, mediaHandle: r.data.handle, mediaUrl: r.data.url } });
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await saveMetaTemplate({ id: mode === "edit" ? templateId : null, draft });
      if (!r.ok) setError(r.error);
      else {
        setNotice(STR.created[lang]);
        router.push("/templates");
        router.refresh();
      }
    });
  }

  const locked = mode === "edit";

  return (
    <div>
      <PageHeader
        title={mode === "create" ? STR.createTitle[lang] : STR.editTitle[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <Link href="/templates" className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-maroon-700 hover:bg-maroon-100">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {STR.back[lang]}
          </Link>
        }
      />
      <div className="mb-4 space-y-2">
        <InlineAlert kind="error" message={error} />
        <InlineAlert kind="success" message={notice} />
        {mode === "edit" && !editable && <InlineAlert kind="error" message={STR.notEditable[lang]} />}
        {mode === "edit" && rejectedReason && <InlineAlert kind="error" message={`${STR.rejectedReason[lang]}: ${rejectedReason}`} />}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Basics */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{STR.basics[lang]}</CardTitle>
              {status && <Badge variant={status === "APPROVED" ? "green" : status === "PENDING" ? "gold" : "red"}>{status}</Badge>}
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Label htmlFor="tpl-name">{STR.name[lang]}</Label>
                <Input id="tpl-name" dir="ltr" value={draft.name} disabled={locked} onChange={(e) => update({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="eid_weekend_offer" />
                <p className="mt-1 text-xs text-maroon-400">{STR.nameHint[lang]}</p>
              </div>
              <div>
                <Label htmlFor="tpl-lang">{STR.language[lang]}</Label>
                <Select id="tpl-lang" value={draft.language} disabled={locked} onChange={(e) => update({ language: e.target.value })}>
                  {TEMPLATE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} ({l.code})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="tpl-cat">{STR.category[lang]}</Label>
                <Select id="tpl-cat" value={draft.category} disabled={locked} onChange={(e) => update({ category: e.target.value as TemplateDraft["category"] })}>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-maroon-400">{STR.categoryHint[lang]}</p>
              </div>
              {mode === "edit" && <p className="text-xs text-maroon-400 sm:col-span-3">{STR.editLimits[lang]}</p>}
            </CardContent>
          </Card>

          {/* Header */}
          <Card>
            <CardHeader>
              <CardTitle>{STR.header[lang]}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="tpl-header-format">{STR.headerFormat[lang]}</Label>
                <Select id="tpl-header-format" value={draft.header.format} onChange={(e) => update({ header: { ...draft.header, format: e.target.value as HeaderFormat } })}>
                  {HEADER_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
              {draft.header.format === "TEXT" && (
                <>
                  <div className="sm:col-span-2">
                    <Label htmlFor="tpl-header-text">{STR.headerText[lang]}</Label>
                    <Input id="tpl-header-text" value={draft.header.text} maxLength={60} onChange={(e) => update({ header: { ...draft.header, text: e.target.value } })} />
                    <p className="mt-1 text-xs text-maroon-400">{STR.headerTextHint[lang]}</p>
                  </div>
                  {headerHasVariable(draft.header.text) && (
                    <div className="sm:col-span-3">
                      <Label htmlFor="tpl-header-ex">{STR.headerExample[lang]}</Label>
                      <Input id="tpl-header-ex" value={draft.header.textExample} onChange={(e) => update({ header: { ...draft.header, textExample: e.target.value } })} />
                    </div>
                  )}
                </>
              )}
              {draft.header.format !== "NONE" && draft.header.format !== "TEXT" && (
                <div className="sm:col-span-2">
                  <Label htmlFor="tpl-media">{STR.media[lang]}</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="tpl-media"
                      type="file"
                      accept={draft.header.format === "IMAGE" ? "image/jpeg,image/png" : draft.header.format === "VIDEO" ? "video/mp4" : "application/pdf"}
                      className="text-sm"
                      disabled={uploading || !appIdKnown}
                      onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
                    />
                    {uploading && <Upload className="h-4 w-4 animate-pulse text-maroon-400" aria-hidden="true" />}
                  </div>
                  <p className="mt-1 text-xs text-maroon-400">{STR.mediaHint[lang]}</p>
                  {!appIdKnown && <p className="mt-1 text-xs text-crimson-700">{STR.noAppId[lang]}</p>}
                  {draft.header.mediaHandle && <p className="mt-1 text-xs text-jabal-700">{STR.mediaUploaded[lang]}</p>}
                  {mode === "edit" && !draft.header.mediaHandle && <p className="mt-1 text-xs text-maroon-500">{STR.mediaKeep[lang]}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Body */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{STR.body[lang]}</CardTitle>
              <Button size="sm" variant="outline" onClick={addVariable}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {STR.addVariable[lang]} {`{{${bodyVars + 1}}}`}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea ref={bodyRef} value={draft.body} rows={7} maxLength={1024} dir={rtl ? "rtl" : "ltr"} onChange={(e) => setBody(e.target.value)} />
              <p className="text-xs text-maroon-400">
                {STR.bodyHint[lang]} · {draft.body.length}/1024
              </p>
              {bodyVars > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.examples[lang]}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: bodyVars }, (_v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <code className="w-12 text-xs text-maroon-500" dir="ltr">{`{{${i + 1}}}`}</code>
                        <Input value={draft.bodyExamples[i] ?? ""} onChange={(e) => setExample(i, e.target.value)} className="h-9 text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Footer + buttons */}
          <Card>
            <CardHeader>
              <CardTitle>{STR.footer[lang]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Input value={draft.footer} maxLength={60} dir={rtl ? "rtl" : "ltr"} onChange={(e) => update({ footer: e.target.value })} />
                <p className="mt-1 text-xs text-maroon-400">{STR.footerHint[lang]}</p>
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-maroon-900">{STR.buttons[lang]}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => addButton("QUICK_REPLY")}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {STR.addQuick[lang]}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addButton("URL")}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {STR.addUrl[lang]}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addButton("PHONE_NUMBER")}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {STR.addPhone[lang]}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {draft.buttons.map((b, i) => (
                    <div key={i} className="grid gap-2 rounded-lg border border-maroon-100 p-3 sm:grid-cols-[110px_1fr_auto]">
                      <Badge variant="outline" className="self-center justify-self-start">
                        {b.type === "URL" ? STR.addUrl[lang] : b.type === "PHONE_NUMBER" ? STR.addPhone[lang] : STR.addQuick[lang]}
                      </Badge>
                      <div className="grid gap-2">
                        <Input value={b.text} maxLength={25} placeholder={STR.buttonText[lang]} onChange={(e) => updateButton(i, { text: e.target.value })} className="h-9 text-sm" />
                        {b.type === "URL" && (
                          <>
                            <Input value={b.url ?? ""} dir="ltr" placeholder={STR.buttonUrl[lang]} onChange={(e) => updateButton(i, { url: e.target.value })} className="h-9 text-sm" />
                            {urlHasSuffix(b.url ?? "") && (
                              <Input value={b.urlExample ?? ""} dir="ltr" placeholder={STR.buttonUrlExample[lang]} onChange={(e) => updateButton(i, { urlExample: e.target.value })} className="h-9 text-sm" />
                            )}
                          </>
                        )}
                        {b.type === "PHONE_NUMBER" && (
                          <Input value={b.phone_number ?? ""} dir="ltr" placeholder={STR.buttonPhone[lang]} onChange={(e) => updateButton(i, { phone_number: e.target.value })} className="h-9 text-sm" />
                        )}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => update({ buttons: draft.buttons.filter((_b, j) => j !== i) })} aria-label={STR.remove[lang]}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <Card>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
              <div className="min-w-0 flex-1">
                {issues.length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider text-maroon-500">{STR.issues[lang]}</p>
                    <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-crimson-700">
                      {issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <Button onClick={submit} disabled={issues.length > 0 || pending || uploading || !editable} loading={pending}>
                <Send className="h-4 w-4" aria-hidden="true" />
                {mode === "create" ? STR.submitCreate[lang] : STR.submitEdit[lang]}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-4">
          <Card>
            <CardHeader>
              <CardTitle>{STR.preview[lang]}</CardTitle>
            </CardHeader>
            <CardContent>
              <TemplatePreview rendered={rendered} rtl={rtl} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
