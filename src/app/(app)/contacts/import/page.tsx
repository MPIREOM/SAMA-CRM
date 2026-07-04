"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Localized, type Strings } from "@/lib/i18n";
import { normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { TablesInsert } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const STR = {
  title: { en: "Import contacts", ar: "استيراد جهات الاتصال" },
  subtitle: {
    en: "Upload a guest list from CSV, XLS or XLSX",
    ar: "حمّل قائمة الضيوف من ملف CSV أو XLS أو XLSX",
  },
  stepUpload: { en: "Upload", ar: "رفع الملف" },
  stepMap: { en: "Map & preview", ar: "مطابقة ومعاينة" },
  stepResult: { en: "Result", ar: "النتيجة" },
  dropTitle: {
    en: "Drop a file here, or click to browse",
    ar: "أفلت الملف هنا، أو انقر للاختيار",
  },
  dropHint: {
    en: "Accepted formats: .csv, .xls, .xlsx — the first sheet is used",
    ar: "الصيغ المقبولة: ‎.csv و ‎.xls و ‎.xlsx — تُستخدم الورقة الأولى",
  },
  badFileType: {
    en: "Unsupported file type — use .csv, .xls or .xlsx",
    ar: "نوع ملف غير مدعوم — استخدم ‎.csv أو ‎.xls أو ‎.xlsx",
  },
  parseFailed: {
    en: "Could not read this file — it may be corrupted",
    ar: "تعذر قراءة الملف — قد يكون تالفًا",
  },
  emptyFile: {
    en: "The file has no data rows",
    ar: "لا يحتوي الملف على صفوف بيانات",
  },
  rowsFound: { en: "rows found in", ar: "صفًا في" },
  sourceColumn: { en: "Source column", ar: "عمود المصدر" },
  sampleValue: { en: "Sample value", ar: "قيمة نموذجية" },
  mapTo: { en: "Import as", ar: "استيراد كـ" },
  ignoreField: { en: "Ignore", ar: "تجاهل" },
  lastStayField: { en: "Last stay", ar: "آخر إقامة" },
  columnWord: { en: "Column", ar: "العمود" },
  previewTitle: { en: "Preview — first 10 rows", ar: "معاينة — أول 10 صفوف" },
  validRows: { en: "valid rows ready to import", ar: "صفًا صالحًا جاهزًا للاستيراد" },
  invalidRows: { en: "invalid rows will be skipped", ar: "صفًا غير صالح سيتم تخطيه" },
  rowWord: { en: "Row", ar: "الصف" },
  reasonMissingPhone: { en: "missing phone", ar: "رقم الهاتف مفقود" },
  reasonInvalidPhone: { en: "invalid phone", ar: "رقم هاتف غير صالح" },
  reasonDuplicate: {
    en: "duplicate phone in file",
    ar: "رقم مكرر داخل الملف",
  },
  moreInvalid: { en: "more…", ar: "أخرى…" },
  phoneNotMapped: {
    en: "Map a column to Phone to continue — phone is required",
    ar: "طابق أحد الأعمدة مع الهاتف للمتابعة — الهاتف مطلوب",
  },
  importNow: { en: "Import", ar: "استيراد" },
  importing: { en: "Importing…", ar: "جارٍ الاستيراد…" },
  chooseAnother: { en: "Choose another file", ar: "اختيار ملف آخر" },
  importedLabel: { en: "Contacts imported", ar: "جهات اتصال مستوردة" },
  skippedLabel: { en: "Invalid rows skipped", ar: "صفوف غير صالحة متخطاة" },
  dbErrors: { en: "Database errors", ar: "أخطاء قاعدة البيانات" },
  doneTitle: { en: "Import complete", ar: "اكتمل الاستيراد" },
  backToContacts: { en: "Back to contacts", ar: "رجوع إلى جهات الاتصال" },
} satisfies Strings;

type TargetField =
  | "name"
  | "phone"
  | "email"
  | "birthday"
  | "tags"
  | "lang"
  | "nationality"
  | "room_type"
  | "last_stay"
  | "consent"
  | "ignore";

type DataField = Exclude<TargetField, "ignore">;
type Cell = string | number | boolean | Date | null | undefined;
type ContactInsert = TablesInsert<"contacts">;

const FIELD_ORDER: DataField[] = [
  "name",
  "phone",
  "email",
  "birthday",
  "tags",
  "lang",
  "nationality",
  "room_type",
  "last_stay",
  "consent",
];

const FIELD_LABELS: Record<TargetField, Localized> = {
  name: COMMON.name,
  phone: COMMON.phone,
  email: COMMON.email,
  birthday: COMMON.birthday,
  tags: COMMON.tags,
  lang: COMMON.language,
  nationality: COMMON.nationality,
  room_type: COMMON.roomType,
  last_stay: STR.lastStayField,
  consent: COMMON.consent,
  ignore: STR.ignoreField,
};

// English + Arabic header synonyms, matched case/space-insensitively.
const SYNONYMS: Array<[TargetField, string[]]> = [
  ["name", ["name", "full name", "fullname", "guest", "guest name", "الاسم", "اسم", "اسم الضيف"]],
  [
    "phone",
    [
      "phone",
      "phone number",
      "mobile",
      "mobile number",
      "tel",
      "telephone",
      "whatsapp",
      "الهاتف",
      "هاتف",
      "رقم الهاتف",
      "الجوال",
      "رقم الجوال",
      "رقم",
      "واتساب",
    ],
  ],
  [
    "email",
    ["email", "e mail", "mail", "email address", "البريد", "البريد الإلكتروني", "البريد الالكتروني", "ايميل", "إيميل"],
  ],
  ["birthday", ["birthday", "dob", "date of birth", "birth date", "تاريخ الميلاد", "الميلاد"]],
  ["tags", ["tags", "tag", "وسوم", "الوسوم", "تصنيف", "تصنيفات"]],
  ["lang", ["language", "lang", "اللغة", "لغة"]],
  ["nationality", ["nationality", "الجنسية", "جنسية"]],
  ["room_type", ["room", "room type", "roomtype", "نوع الغرفة", "الغرفة"]],
  ["last_stay", ["last stay", "laststay", "آخر إقامة", "اخر اقامة", "آخر اقامة"]],
  ["consent", ["consent", "marketing consent", "opt in", "optin", "موافقة", "الموافقة"]],
];

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function autoMatch(header: string): TargetField {
  const n = normalizeHeader(header);
  if (!n) return "ignore";
  for (const [field, names] of SYNONYMS) {
    if (names.some((candidate) => normalizeHeader(candidate) === n)) return field;
  }
  return "ignore";
}

function cellToString(v: Cell): string {
  if (v == null) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : format(v, "yyyy-MM-dd");
  return String(v).trim();
}

/** Date object or string -> YYYY-MM-DD, or null when unusable. */
function toISODate(v: Cell): string | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : format(v, "yyyy-MM-dd");
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : format(d, "yyyy-MM-dd");
}

function normalizeLangValue(v: Cell): "ar" | "en" | null {
  const s = cellToString(v).toLowerCase();
  if (!s) return null;
  if (s === "ar" || s.startsWith("arab") || s.includes("عرب")) return "ar";
  if (s === "en" || s.startsWith("eng") || s.includes("انجليز") || s.includes("إنجليز")) return "en";
  return null;
}

function isTruthyConsent(v: Cell): boolean {
  if (v === true) return true;
  const s = cellToString(v).toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "نعم" || s === "y";
}

export default function ImportContactsPage() {
  const { lang } = useLang();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Cell[][]>([]);
  const [mapping, setMapping] = useState<TargetField[]>([]);
  const [parseError, setParseError] = useState<Localized | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  function resetAll() {
    setStep(1);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping([]);
    setParseError(null);
    setResult(null);
  }

  async function handleFile(file: File) {
    setParseError(null);
    if (!/\.(csv|xls|xlsx)$/i.test(file.name)) {
      setParseError(STR.badFileType);
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
      if (!sheet) {
        setParseError(STR.emptyFile);
        return;
      }
      const aoa = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null });
      const headerRow = (aoa[0] ?? []).map((v) => cellToString(v));
      const dataRows = aoa
        .slice(1)
        .filter((r) => Array.isArray(r) && r.some((v) => cellToString(v) !== ""));
      if (headerRow.length === 0 || dataRows.length === 0) {
        setParseError(STR.emptyFile);
        return;
      }
      setFileName(file.name);
      setHeaders(headerRow);
      setRows(dataRows);
      setMapping(headerRow.map((h) => autoMatch(h)));
      setStep(2);
    } catch {
      setParseError(STR.parseFailed);
    }
  }

  const samples = useMemo(
    () =>
      headers.map((_, col) => {
        for (const r of rows) {
          const s = cellToString(r[col]);
          if (s) return s;
        }
        return "—";
      }),
    [headers, rows]
  );

  const processed = useMemo(() => {
    const valid: ContactInsert[] = [];
    const invalid: { row: number; reason: Localized }[] = [];
    const seenPhones = new Set<string>();
    const nowIso = new Date().toISOString();
    const phoneMapped = mapping.includes("phone");

    rows.forEach((r, i) => {
      const rowNo = i + 2; // header is spreadsheet row 1
      const rec: Partial<Record<DataField, Cell>> = {};
      mapping.forEach((field, col) => {
        if (field === "ignore") return;
        const v = r[col];
        if (cellToString(v) === "") return;
        if (rec[field] == null) rec[field] = v;
      });

      // Skip rows with nothing mapped at all.
      if (Object.keys(rec).length === 0) return;

      const phone = normalizePhone(cellToString(rec.phone));
      if (!phone) {
        invalid.push({
          row: rowNo,
          reason: rec.phone == null ? STR.reasonMissingPhone : STR.reasonInvalidPhone,
        });
        return;
      }
      if (seenPhones.has(phone)) {
        invalid.push({ row: rowNo, reason: STR.reasonDuplicate });
        return;
      }
      seenPhones.add(phone);

      const payload: ContactInsert = {
        name: cellToString(rec.name) || phone,
        phone,
      };
      const email = cellToString(rec.email);
      if (email) payload.email = email;
      const birthday = toISODate(rec.birthday);
      if (birthday) payload.birthday = birthday;
      const lastStay = toISODate(rec.last_stay);
      if (lastStay) payload.last_stay = lastStay;
      const nationality = cellToString(rec.nationality);
      if (nationality) payload.nationality = nationality;
      const roomType = cellToString(rec.room_type);
      if (roomType) payload.room_type = roomType;
      const langValue = normalizeLangValue(rec.lang);
      if (langValue) payload.lang = langValue;
      if (rec.tags != null) {
        const tags = cellToString(rec.tags)
          .split(/[,;،؛]/)
          .map((t) => t.trim())
          .filter(Boolean);
        if (tags.length > 0) payload.tags = tags;
      }
      // Consent: only set when explicitly truthy; otherwise leave the
      // consent fields out entirely so an upsert never revokes consent.
      if (rec.consent != null && isTruthyConsent(rec.consent)) {
        payload.consent = true;
        payload.consent_source = "import";
        payload.consent_at = nowIso;
      }
      valid.push(payload);
    });

    return { valid, invalid, phoneMapped };
  }, [rows, mapping]);

  const previewFields = useMemo(
    () => FIELD_ORDER.filter((f) => mapping.includes(f)),
    [mapping]
  );

  async function handleImport() {
    setImporting(true);
    // PostgREST bulk payloads need uniform keys per request, so group rows
    // by key signature, then upsert each group in batches of 100.
    const groups = new Map<string, ContactInsert[]>();
    for (const payload of processed.valid) {
      const signature = Object.keys(payload).sort().join("|");
      const group = groups.get(signature);
      if (group) group.push(payload);
      else groups.set(signature, [payload]);
    }
    let imported = 0;
    const errors: string[] = [];
    for (const group of Array.from(groups.values())) {
      for (let i = 0; i < group.length; i += 100) {
        const batch = group.slice(i, i + 100);
        const { error } = await supabase
          .from("contacts")
          .upsert(batch, { onConflict: "phone" });
        if (error) errors.push(error.message);
        else imported += batch.length;
      }
    }
    setResult({ imported, skipped: processed.invalid.length, errors });
    setImporting(false);
    setStep(3);
  }

  function previewValue(p: ContactInsert, field: DataField): string {
    switch (field) {
      case "name":
        return p.name;
      case "phone":
        return p.phone;
      case "email":
        return p.email ?? "—";
      case "birthday":
        return p.birthday ?? "—";
      case "tags":
        return (p.tags ?? []).join(", ") || "—";
      case "lang":
        return p.lang ?? "—";
      case "nationality":
        return p.nationality ?? "—";
      case "room_type":
        return p.room_type ?? "—";
      case "last_stay":
        return p.last_stay ?? "—";
      case "consent":
        return p.consent ? COMMON.yes[lang] : COMMON.no[lang];
    }
  }

  const steps: Localized[] = [STR.stepUpload, STR.stepMap, STR.stepResult];
  const invalidShown = processed.invalid.slice(0, 15);

  return (
    <div>
      <Link
        href="/contacts"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-maroon-500 hover:text-maroon-800"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {STR.backToContacts[lang]}
      </Link>

      <PageHeader title={STR.title[lang]} subtitle={STR.subtitle[lang]} />

      {/* Step indicator */}
      <ol className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <li key={s.en} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  active && "bg-maroon-800 text-gold-100",
                  done && "bg-jabal-600 text-white",
                  !active && !done && "bg-maroon-100 text-maroon-400"
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : n}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  active ? "text-maroon-900" : "text-maroon-400"
                )}
              >
                {s[lang]}
              </span>
              {i < steps.length - 1 && (
                <span className="mx-1 h-px w-8 bg-maroon-200" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {/* ---------------------------------------------------------- Step 1 */}
      {step === 1 && (
        <Card>
          <CardContent>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors",
                dragOver
                  ? "border-gold-500 bg-gold-50"
                  : "border-maroon-200 bg-maroon-50/40 hover:border-gold-400 hover:bg-gold-50/50"
              )}
            >
              <span className="rounded-full bg-maroon-100 p-4 text-maroon-500">
                <UploadCloud className="h-8 w-8" />
              </span>
              <p className="text-base font-bold text-maroon-800">{STR.dropTitle[lang]}</p>
              <p className="text-sm text-maroon-400">{STR.dropHint[lang]}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            {parseError && (
              <p role="alert" className="mt-4 rounded-lg bg-crimson-50 px-3 py-2 text-sm font-semibold text-crimson-700">
                {parseError[lang]}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------- Step 2 */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-maroon-500">
            <FileSpreadsheet className="h-4 w-4 text-gold-600" />
            <span>
              <span className="font-bold text-maroon-800">{rows.length}</span>{" "}
              {STR.rowsFound[lang]}{" "}
              <span dir="ltr" className="inline-block font-semibold text-maroon-800">
                {fileName}
              </span>
            </span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{STR.stepMap[lang]}</CardTitle>
            </CardHeader>
            <Table>
              <THead>
                <TR>
                  <TH>{STR.sourceColumn[lang]}</TH>
                  <TH>{STR.sampleValue[lang]}</TH>
                  <TH>{STR.mapTo[lang]}</TH>
                </TR>
              </THead>
              <TBody>
                {headers.map((h, col) => (
                  <TR key={col}>
                    <TD className="font-semibold text-maroon-900">
                      {h || `${STR.columnWord[lang]} ${col + 1}`}
                    </TD>
                    <TD className="max-w-48 truncate text-maroon-500" dir="auto">
                      {samples[col]}
                    </TD>
                    <TD>
                      <Select
                        value={mapping[col] ?? "ignore"}
                        onChange={(e) =>
                          setMapping((prev) =>
                            prev.map((m, i) =>
                              i === col ? (e.target.value as TargetField) : m
                            )
                          )
                        }
                        className="h-9 w-48"
                        aria-label={`${STR.mapTo[lang]}: ${h || col + 1}`}
                      >
                        {(["ignore", ...FIELD_ORDER] as TargetField[]).map((f) => (
                          <option key={f} value={f}>
                            {FIELD_LABELS[f][lang]}
                          </option>
                        ))}
                      </Select>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          {/* Validation summary */}
          <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            <span className="inline-flex items-center gap-1.5 text-jabal-600">
              <CheckCircle2 className="h-4 w-4" />
              {processed.valid.length} {STR.validRows[lang]}
            </span>
            {processed.invalid.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-crimson-700">
                <XCircle className="h-4 w-4" />
                {processed.invalid.length} {STR.invalidRows[lang]}
              </span>
            )}
          </div>

          {!processed.phoneMapped && (
            <p className="flex items-center gap-2 rounded-lg bg-gold-50 px-3 py-2 text-sm font-semibold text-gold-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {STR.phoneNotMapped[lang]}
            </p>
          )}

          {processed.invalid.length > 0 && (
            <Card>
              <CardContent>
                <ul className="space-y-1 text-sm text-crimson-700">
                  {invalidShown.map((inv, i) => (
                    <li key={i}>
                      {STR.rowWord[lang]} {inv.row} — {inv.reason[lang]}
                    </li>
                  ))}
                  {processed.invalid.length > invalidShown.length && (
                    <li className="text-maroon-400">
                      +{processed.invalid.length - invalidShown.length}{" "}
                      {STR.moreInvalid[lang]}
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {processed.valid.length > 0 && previewFields.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{STR.previewTitle[lang]}</CardTitle>
              </CardHeader>
              <Table>
                <THead>
                  <TR>
                    {previewFields.map((f) => (
                      <TH key={f}>{FIELD_LABELS[f][lang]}</TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {processed.valid.slice(0, 10).map((p, i) => (
                    <TR key={i}>
                      {previewFields.map((f) => (
                        <TD key={f} dir={f === "phone" ? "ltr" : "auto"}>
                          {f === "consent" ? (
                            <Badge variant={p.consent ? "green" : "gray"}>
                              {previewValue(p, f)}
                            </Badge>
                          ) : (
                            previewValue(p, f)
                          )}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={resetAll} disabled={importing}>
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              {STR.chooseAnother[lang]}
            </Button>
            <Button
              onClick={() => void handleImport()}
              loading={importing}
              disabled={!processed.phoneMapped || processed.valid.length === 0}
            >
              {importing
                ? STR.importing[lang]
                : `${STR.importNow[lang]} (${processed.valid.length})`}
            </Button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- Step 3 */}
      {step === 3 && result && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.errors.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-jabal-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-gold-600" />
                )}
                {STR.doneTitle[lang]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-jabal-200 bg-jabal-50 p-4">
                  <p className="text-3xl font-extrabold text-jabal-700" dir="ltr">
                    {result.imported}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-jabal-700">
                    {STR.importedLabel[lang]}
                  </p>
                </div>
                <div className="rounded-xl border border-crimson-200 bg-crimson-50 p-4">
                  <p className="text-3xl font-extrabold text-crimson-700" dir="ltr">
                    {result.skipped}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-crimson-700">
                    {STR.skippedLabel[lang]}
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="mt-4 rounded-lg bg-crimson-50 p-3">
                  <p className="mb-1 text-sm font-bold text-crimson-700">
                    {STR.dbErrors[lang]}
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-crimson-700">
                    {result.errors.map((err, i) => (
                      <li key={i} dir="ltr" className="break-all text-start">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => router.push("/contacts")}>
              {STR.backToContacts[lang]}
            </Button>
            <Button variant="outline" onClick={resetAll}>
              {STR.chooseAnother[lang]}
            </Button>
          </div>
        </div>
      )}

      {importing && (
        <p className="mt-4 flex items-center gap-2 text-sm text-maroon-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {STR.importing[lang]}
        </p>
      )}
    </div>
  );
}
