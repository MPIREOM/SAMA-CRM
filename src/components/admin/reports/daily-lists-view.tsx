"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import type { Strings } from "@/lib/i18n";
import { addDays } from "@/lib/booking-engine/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "../shared";

type Row = Record<string, string | number | null> & { id: string };

const STR = {
  title: { en: "Arrivals & departures", ar: "الوصول والمغادرة" },
  subtitle: { en: "Front-desk lists for the selected day", ar: "قوائم مكتب الاستقبال لليوم المحدد" },
  print: { en: "Print", ar: "طباعة" },
  excel: { en: "Excel", ar: "Excel" },
  today: { en: "Today", ar: "اليوم" },
  arrivals: { en: "Arrivals", ar: "الوصول" },
  departures: { en: "Departures", ar: "المغادرة" },
  inHouse: { en: "In-house tonight", ar: "المقيمون الليلة" },
  room: { en: "Room", ar: "الغرفة" },
  guest: { en: "Guest", ar: "الضيف" },
  stay: { en: "Stay", ar: "الإقامة" },
  pax: { en: "Guests", ar: "الضيوف" },
  addons: { en: "Add-ons", ar: "الإضافات" },
  notes: { en: "Requests / notes", ar: "الطلبات / الملاحظات" },
  due: { en: "Total (OMR)", ar: "الإجمالي (ر.ع)" },
  status: { en: "Status", ar: "الحالة" },
  none: { en: "None", ar: "لا يوجد" },
  unassigned: { en: "Not assigned", ar: "غير مخصصة" },
  printedFor: { en: "Sama Hotel — front-desk lists for", ar: "فندق سما — قوائم الاستقبال ليوم" },
} satisfies Strings;

function ListTable({ title, rows, testId }: { title: string; rows: Row[]; testId: string }) {
  const { lang } = useLang();
  return (
    <Card className="mb-6 overflow-hidden print:mb-4 print:break-inside-avoid-page print:shadow-none" data-testid={testId}>
      <h2 className="border-b border-maroon-100 px-4 py-3 text-sm font-extrabold text-maroon-900">
        {title} <span className="ms-1 rounded-full bg-maroon-100 px-2 py-0.5 text-xs text-maroon-700">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-maroon-400">{STR.none[lang]}</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <Table className="print:text-[11px]">
            <THead>
              <tr>
                <TH>{STR.room[lang]}</TH>
                <TH>{STR.guest[lang]}</TH>
                <TH>{STR.stay[lang]}</TH>
                <TH>{STR.pax[lang]}</TH>
                <TH>{STR.addons[lang]}</TH>
                <TH>{STR.notes[lang]}</TH>
                <TH className="text-end">{STR.due[lang]}</TH>
                <TH>{STR.status[lang]}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <span className="font-bold text-maroon-900">{r.Room || <span className="text-xs font-normal text-crimson-700">{STR.unassigned[lang]}</span>}</span>
                    <span className="block text-[11px] text-maroon-400">{r.Category}</span>
                  </TD>
                  <TD>
                    <Link href={`/reservations/${r.id}`} className="font-semibold text-maroon-900 hover:underline print:no-underline">
                      {r.Guest}
                    </Link>
                    <span className="block text-[11px] text-maroon-400" dir="ltr">
                      {r.Phone} · {r.Ref}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    {fmtDate(String(r["Check-in"]), lang)} → {fmtDate(String(r["Check-out"]), lang)}
                    <span className="block text-maroon-400">{r.Nights}N</span>
                  </TD>
                  <TD className="text-xs">{r.Guests}</TD>
                  <TD className="max-w-[12rem] text-xs">{r["Add-ons"]}</TD>
                  <TD className="max-w-[16rem] text-xs text-maroon-600">{[r["Special requests"], r["Internal notes"]].filter(Boolean).join(" · ")}</TD>
                  <TD className="text-end text-xs tabular-nums">{Number(r["Total due (OMR)"]).toFixed(3)}</TD>
                  <TD>
                    <Badge variant={r.Status === "checked_in" ? "green" : r.Status === "checked_out" ? "gray" : "gold"}>{String(r.Status).replace("_", " ")}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

export function DailyListsView({ date, today, arrivals, departures, inHouse }: { date: string; today: string; arrivals: Row[]; departures: Row[]; inHouse: Row[] }) {
  const { lang } = useLang();
  const router = useRouter();
  const go = (d: string) => router.push(`/daily-lists?date=${d}`);

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title={STR.title[lang]}
          subtitle={`${STR.subtitle[lang]} · ${fmtDate(date, lang)}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <a
                href={`/reports/export?type=daily&from=${date}&format=xlsx`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-maroon-200 px-3 py-2 text-sm font-semibold text-maroon-800 hover:bg-maroon-50"
              >
                <Download className="h-4 w-4" />
                {STR.excel[lang]}
              </a>
              <Button onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                {STR.print[lang]}
              </Button>
            </div>
          }
        />
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => go(addDays(date, -1))} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="h-9 w-44" aria-label="Date" />
          <Button variant="outline" size="sm" onClick={() => go(addDays(date, 1))} aria-label="Next day">
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
          {date !== today && (
            <Button variant="ghost" size="sm" onClick={() => go(today)}>
              {STR.today[lang]}
            </Button>
          )}
        </div>
      </div>
      <h1 className="mb-3 hidden text-lg font-extrabold print:block">
        {STR.printedFor[lang]} {fmtDate(date, lang)}
      </h1>
      <ListTable title={STR.arrivals[lang]} rows={arrivals} testId="list-arrivals" />
      <ListTable title={STR.departures[lang]} rows={departures} testId="list-departures" />
      <ListTable title={STR.inHouse[lang]} rows={inHouse} testId="list-inhouse" />
    </div>
  );
}
