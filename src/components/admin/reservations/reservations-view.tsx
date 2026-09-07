"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, ChevronLeft, ChevronRight, Download, Plus, SearchX } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkBookingStatus, Role } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  BOOKING_STATUSES,
  fmtDate,
  fmtMoney,
  localName,
  sourceLabel,
  statusLabel,
  statusVariant,
} from "../shared";

export const PAGE_SIZE = 50;

export interface ReservationRow {
  id: string;
  ref: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  room_type_id: string;
  room_id: string | null;
  check_in: string;
  check_out: string;
  nights: number | null;
  adults: number;
  children: number;
  status: string;
  source: string;
  total_omr: number;
  created_at: string;
  room_type: { name_en: string; name_ar: string } | null;
  room: { room_number: string } | null;
}

export interface ReservationsFilters {
  statuses: BkBookingStatus[];
  from: string;
  to: string;
  type: string;
  q: string;
  page: number;
}

const STR = {
  subtitle: { en: "Every stay from the website, phone, walk-ins and OTAs", ar: "جميع الإقامات من الموقع والهاتف والحضور المباشر ومنصات الحجز" },
  newBooking: { en: "New booking", ar: "حجز جديد" },
  searchPlaceholder: { en: "Guest, phone or ref…", ar: "النزيل أو الهاتف أو المرجع…" },
  allTypes: { en: "All room types", ar: "كل أنواع الغرف" },
  checkInFrom: { en: "Check-in from", ar: "الوصول من" },
  checkInTo: { en: "Check-in to", ar: "الوصول حتى" },
  emptyTitle: { en: "No reservations yet", ar: "لا توجد حجوزات بعد" },
  emptyDesc: { en: "Bookings from the website and the front desk will appear here.", ar: "ستظهر هنا الحجوزات من الموقع ومكتب الاستقبال." },
  noMatch: { en: "Try different filters or a shorter search.", ar: "جرّب مرشحات أخرى أو بحثاً أقصر." },
  results: { en: "results", ar: "نتيجة" },
  page: { en: "Page", ar: "صفحة" },
  of: { en: "of", ar: "من" },
  exportHint: { en: "Exports the current check-in date range as CSV", ar: "يصدّر نطاق تواريخ الوصول الحالي كملف CSV" },
} satisfies Strings;

function buildQuery(f: ReservationsFilters, overrides: Partial<ReservationsFilters> = {}): string {
  const next = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (next.statuses.length) p.set("status", next.statuses.join(","));
  if (next.from) p.set("from", next.from);
  if (next.to) p.set("to", next.to);
  if (next.type) p.set("type", next.type);
  if (next.q) p.set("q", next.q);
  if (next.page > 1) p.set("page", String(next.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function ReservationsView({
  rows,
  total,
  filters,
  types,
  role,
}: {
  rows: ReservationRow[];
  total: number;
  filters: ReservationsFilters;
  types: { id: string; name_en: string; name_ar: string }[];
  role: Role;
}) {
  const { lang } = useLang();
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function apply(overrides: Partial<ReservationsFilters>) {
    router.push(`/reservations${buildQuery(filters, { page: 1, ...overrides })}`);
  }

  function toggleStatus(s: BkBookingStatus) {
    const has = filters.statuses.includes(s);
    apply({ statuses: has ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s] });
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    apply({ q: q.trim() });
  }

  const hasFilters = filters.statuses.length > 0 || filters.from || filters.to || filters.type || filters.q;
  const exportHref = `/reservations/export${buildQuery({ ...filters, statuses: [], type: "", q: "", page: 1 })}`;

  return (
    <div>
      <PageHeader
        title={COMMON.reservations[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <>
            {role === "super_admin" && (
              <a
                href={exportHref}
                title={STR.exportHint[lang]}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-maroon-200 bg-white px-4 text-sm font-semibold text-maroon-800 hover:bg-maroon-50"
              >
                <Download className="h-4 w-4" />
                {COMMON.export[lang]}
              </a>
            )}
            <Button onClick={() => router.push("/reservations/new")}>
              <Plus className="h-4 w-4" />
              {STR.newBooking[lang]}
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {BOOKING_STATUSES.map((s) => {
          const active = filters.statuses.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                active ? "border-maroon-800 bg-maroon-800 text-gold-100" : "border-maroon-200 bg-white text-maroon-600 hover:bg-maroon-50"
              )}
            >
              {statusLabel(s, lang)}
            </button>
          );
        })}
        {hasFilters && (
          <button type="button" onClick={() => router.push("/reservations")} className="ms-1 text-xs font-semibold text-crimson-700 hover:underline">
            {COMMON.reset[lang]}
          </button>
        )}
      </div>
      <form onSubmit={onSearch} className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-maroon-400">{STR.checkInFrom[lang]}</label>
          <Input type="date" value={filters.from} onChange={(e) => apply({ from: e.target.value })} className="h-9 w-40 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-maroon-400">{STR.checkInTo[lang]}</label>
          <Input type="date" value={filters.to} onChange={(e) => apply({ to: e.target.value })} className="h-9 w-40 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-maroon-400">{COMMON.roomType[lang]}</label>
          <Select value={filters.type} onChange={(e) => apply({ type: e.target.value })} className="h-9 w-48 text-xs">
            <option value="">{STR.allTypes[lang]}</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {localName(t, lang)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="mb-1 block text-[11px] font-semibold text-maroon-400">{COMMON.search[lang]}</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={STR.searchPlaceholder[lang]} className="h-9 text-xs" />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          {COMMON.filter[lang]}
        </Button>
        <span className="ms-auto text-xs font-semibold text-maroon-400">
          {total.toLocaleString(lang === "ar" ? "ar-OM" : "en-GB")} {STR.results[lang]}
        </span>
      </form>

      <Card className="overflow-hidden">
        {total === 0 && !hasFilters ? (
          <EmptyState
            icon={<BedDouble className="h-8 w-8" />}
            title={STR.emptyTitle[lang]}
            description={STR.emptyDesc[lang]}
            action={
              <Button onClick={() => router.push("/reservations/new")}>
                <Plus className="h-4 w-4" />
                {STR.newBooking[lang]}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={<SearchX className="h-8 w-8" />} title={COMMON.noResults[lang]} description={STR.noMatch[lang]} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{COMMON.ref[lang]}</TH>
                <TH>{COMMON.guest[lang]}</TH>
                <TH>{COMMON.checkIn[lang]}</TH>
                <TH>{COMMON.checkOut[lang]}</TH>
                <TH>{COMMON.nights[lang]}</TH>
                <TH>{COMMON.roomType[lang]}</TH>
                <TH>{COMMON.room[lang]}</TH>
                <TH>{COMMON.source[lang]}</TH>
                <TH>{COMMON.status[lang]}</TH>
                <TH className="ltr:text-right rtl:text-left">{COMMON.total[lang]}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((b) => (
                <TR key={b.id} className="cursor-pointer hover:bg-maroon-50/50" onClick={() => router.push(`/reservations/${b.id}`)}>
                  <TD className="font-bold text-maroon-900">
                    <Link href={`/reservations/${b.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                      {b.ref}
                    </Link>
                  </TD>
                  <TD>
                    <p className="font-semibold">{b.guest_name}</p>
                    <p className="text-xs text-maroon-400" dir="ltr">
                      {b.guest_phone}
                    </p>
                  </TD>
                  <TD>{fmtDate(b.check_in, lang)}</TD>
                  <TD>{fmtDate(b.check_out, lang)}</TD>
                  <TD>{b.nights ?? "—"}</TD>
                  <TD className="max-w-[12rem] truncate">{localName(b.room_type, lang)}</TD>
                  <TD>{b.room?.room_number ?? <span className="text-maroon-300">—</span>}</TD>
                  <TD>
                    <Badge variant="outline">{sourceLabel(b.source, lang)}</Badge>
                  </TD>
                  <TD>
                    <Badge variant={statusVariant(b.status)}>{statusLabel(b.status, lang)}</Badge>
                  </TD>
                  <TD className="font-semibold ltr:text-right rtl:text-left">{fmtMoney(b.total_omr, lang)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm text-maroon-600">
          <span>
            {STR.page[lang]} {filters.page} {STR.of[lang]} {pages}
          </span>
          <Button variant="outline" size="sm" disabled={filters.page <= 1} onClick={() => apply({ page: filters.page - 1 })}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="sm" disabled={filters.page >= pages} onClick={() => apply({ page: filters.page + 1 })}>
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      )}
    </div>
  );
}
