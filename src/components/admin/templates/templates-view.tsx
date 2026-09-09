"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { deleteMetaTemplate } from "@/app/(crm)/(app)/templates/actions";
import { renderMetaTemplate, type MetaTemplateSummary } from "@/lib/messaging/meta-template-model";
import { InlineAlert } from "../load-error";
import { TemplatePreview } from "./template-preview";

const STR = {
  title: { en: "WhatsApp templates", ar: "قوالب واتساب" },
  subtitle: {
    en: "Marketing and utility templates on the WhatsApp Business Account. Meta reviews every new or edited template before it can be sent.",
    ar: "قوالب التسويق والخدمة في حساب واتساب للأعمال. تراجع Meta كل قالب جديد أو معدّل قبل إمكانية إرساله.",
  },
  newTemplate: { en: "New template", ar: "قالب جديد" },
  refresh: { en: "Refresh", ar: "تحديث" },
  search: { en: "Search by name", ar: "بحث بالاسم" },
  allStatuses: { en: "All statuses", ar: "كل الحالات" },
  allCategories: { en: "All categories", ar: "كل الفئات" },
  empty: { en: "No templates yet", ar: "لا توجد قوالب بعد" },
  emptyDesc: { en: "Create your first marketing template — Meta usually approves within minutes.", ar: "أنشئوا أول قالب تسويقي — توافق Meta عادةً خلال دقائق." },
  languages: { en: "Languages", ar: "اللغات" },
  category: { en: "Category", ar: "الفئة" },
  quality: { en: "Quality", ar: "الجودة" },
  edit: { en: "Edit", ar: "تعديل" },
  preview: { en: "Preview", ar: "معاينة" },
  hide: { en: "Hide", ar: "إخفاء" },
  delete: { en: "Delete", ar: "حذف" },
  deleteTitle: { en: "Delete template", ar: "حذف القالب" },
  deleteWarning: {
    en: "This removes every language of the template from Meta. An approved name cannot be reused for 30 days, and pending sends are attempted for 30 more days.",
    ar: "سيُحذف القالب بكل لغاته من Meta. لا يمكن إعادة استخدام اسم قالب معتمد لمدة 30 يوماً، وتستمر محاولات إرسال الرسائل المعلقة 30 يوماً إضافية.",
  },
  deleteOne: { en: "Delete only this language", ar: "حذف هذه اللغة فقط" },
  deleteAll: { en: "Delete all languages", ar: "حذف كل اللغات" },
  deleted: { en: "Template deleted.", ar: "تم حذف القالب." },
  guestEngine: { en: "used by the booking engine", ar: "مستخدم في محرك الحجز" },
  rejected: { en: "rejected", ar: "مرفوض" },
  count: { en: "templates", ar: "قوالب" },
} satisfies Strings;

const ENGINE_NAMES = ["sama_booking_confirmation", "sama_pre_arrival_guide", "sama_post_stay_review"];

function statusVariant(status: string): "green" | "gold" | "red" | "gray" {
  if (status === "APPROVED") return "green";
  if (status === "PENDING" || status === "IN_APPEAL") return "gold";
  if (["REJECTED", "PAUSED", "DISABLED", "LIMIT_EXCEEDED"].includes(status)) return "red";
  return "gray";
}

interface Group {
  name: string;
  category: string | null;
  variants: MetaTemplateSummary[];
}

export function TemplatesView({ templates, error }: { templates: MetaTemplateSummary[]; error: string | null }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ name: string; id: string | null; language: string | null } | null>(null);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const t of templates) {
      if (q && !t.name.includes(q.trim().toLowerCase())) continue;
      if (status && t.status !== status) continue;
      if (category && (t.category ?? "") !== category) continue;
      const g = map.get(t.name) ?? { name: t.name, category: t.category, variants: [] };
      g.variants.push(t);
      map.set(t.name, g);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, q, status, category]);

  const statuses = useMemo(() => Array.from(new Set(templates.map((t) => t.status))).sort(), [templates]);

  function runDelete(name: string, id: string | null) {
    setActionError(null);
    setNotice(null);
    start(async () => {
      const r = await deleteMetaTemplate({ name, id });
      setConfirm(null);
      if (!r.ok) setActionError(r.error);
      else {
        setNotice(STR.deleted[lang]);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <PageHeader
        title={STR.title[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => router.refresh()} disabled={pending}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {STR.refresh[lang]}
            </Button>
            <Link href="/templates/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-maroon-800 px-4 text-sm font-semibold text-gold-100 hover:bg-maroon-700">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {STR.newTemplate[lang]}
            </Link>
          </>
        }
      />
      <div className="mb-4 space-y-2">
        <InlineAlert kind="error" message={error ?? actionError} />
        <InlineAlert kind="success" message={notice} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            {groups.length} {STR.count[lang]}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={STR.search[lang]} className="h-8 w-44 text-xs" dir="ltr" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-36 text-xs" aria-label={STR.allStatuses[lang]}>
              <option value="">{STR.allStatuses[lang]}</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-36 text-xs" aria-label={STR.allCategories[lang]}>
              <option value="">{STR.allCategories[lang]}</option>
              <option value="MARKETING">MARKETING</option>
              <option value="UTILITY">UTILITY</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {groups.length === 0 ? (
            <EmptyState title={STR.empty[lang]} description={STR.emptyDesc[lang]} />
          ) : (
            <ul className="divide-y divide-maroon-100">
              {groups.map((g) => (
                <li key={g.name} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-sm font-bold text-maroon-900" dir="ltr">
                          {g.name}
                        </code>
                        <Badge variant={g.category === "MARKETING" ? "gold" : "outline"}>{g.category ?? "—"}</Badge>
                        {ENGINE_NAMES.includes(g.name) && <Badge variant="maroon">{STR.guestEngine[lang]}</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {g.variants.map((v) => (
                          <span key={v.id} className="inline-flex items-center gap-1.5 rounded-full border border-maroon-100 bg-white px-2 py-1 text-xs" dir="ltr">
                            <span className="font-semibold text-maroon-700">{v.language}</span>
                            <Badge variant={statusVariant(v.status)}>{v.status}</Badge>
                            {v.qualityScore && <span className="text-maroon-400">· {v.qualityScore}</span>}
                            {v.rejectedReason && (
                              <span className="text-crimson-700" title={v.rejectedReason}>
                                · {STR.rejected[lang]}: {v.rejectedReason}
                              </span>
                            )}
                            <Link href={`/templates/${v.id}`} className="ms-1 inline-flex items-center gap-1 text-maroon-700 hover:underline">
                              <Pencil className="h-3 w-3" aria-hidden="true" />
                              {STR.edit[lang]}
                            </Link>
                            <button type="button" className="inline-flex items-center gap-1 text-crimson-700 hover:underline" onClick={() => setConfirm({ name: g.name, id: v.id, language: v.language })}>
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setPreviewing(previewing === g.name ? null : g.name)}>
                        {previewing === g.name ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        {previewing === g.name ? STR.hide[lang] : STR.preview[lang]}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ name: g.name, id: null, language: null })} disabled={pending}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {STR.delete[lang]}
                      </Button>
                    </div>
                  </div>
                  {previewing === g.name && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {g.variants.map((v) => (
                        <div key={v.id}>
                          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-maroon-500" dir="ltr">
                            {v.language}
                          </p>
                          <TemplatePreview rendered={renderMetaTemplate(v)} rtl={v.language.toLowerCase().startsWith("ar")} />
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} title={STR.deleteTitle[lang]}>
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-maroon-700">
              <code dir="ltr">{confirm.name}</code>
              {confirm.language && <span dir="ltr"> · {confirm.language}</span>}
            </p>
            <p className="text-sm text-crimson-700">{STR.deleteWarning[lang]}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)} disabled={pending}>
                {COMMON.cancel[lang]}
              </Button>
              {confirm.id && (
                <Button variant="danger" onClick={() => runDelete(confirm.name, confirm.id)} loading={pending}>
                  {STR.deleteOne[lang]}
                </Button>
              )}
              <Button variant="danger" onClick={() => runDelete(confirm.name, null)} loading={pending}>
                {STR.deleteAll[lang]}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
