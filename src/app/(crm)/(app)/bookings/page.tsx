"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Plus, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Booking, BookingSource } from "@/lib/database.types";
import { COMMON, type Strings } from "@/lib/i18n";
import { useLang } from "@/components/providers/lang-provider";
import { cn, formatDate, nightsBetween } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  roomTypeLabel,
  sourceBadgeVariant,
  sourceLabel,
  STATUSES,
  statusLabel,
} from "@/components/bookings/booking-shared";

const STR = {
  title: { en: "Bookings", ar: "الحجوزات" },
  subtitle: {
    en: "All reservations from the website, OTAs and the front desk",
    ar: "جميع الحجوزات من الموقع ومنصات الحجز ومكتب الاستقبال",
  },
  newBooking: { en: "New booking", ar: "حجز جديد" },
  ref: { en: "Ref", ar: "المرجع" },
  guest: { en: "Guest", ar: "النزيل" },
  searchPlaceholder: {
    en: "Search ref, guest or phone…",
    ar: "ابحث بالمرجع أو الاسم أو الهاتف…",
  },
  emptyTitle: { en: "No bookings yet", ar: "لا توجد حجوزات بعد" },
  emptyDesc: {
    en: "Bookings from the website, OTAs and the front desk will appear here.",
    ar: "ستظهر هنا الحجوزات القادمة من الموقع ومنصات الحجز ومكتب الاستقبال.",
  },
  noMatchDesc: {
    en: "Try a different search or source filter.",
    ar: "جرّب بحثًا آخر أو مصدرًا مختلفًا.",
  },
  loadError: {
    en: "Could not load bookings",
    ar: "تعذّر تحميل الحجوزات",
  },
  updateError: {
    en: "Could not update the booking status",
    ar: "تعذّر تحديث حالة الحجز",
  },
  countSuffix: { en: "bookings", ar: "حجزًا" },
} satisfies Strings;

type SourceFilter = "All" | BookingSource;

const FILTERS: SourceFilter[] = ["All", "Website", "OTA", "Offline"];

function statusSelectClass(status: string | null): string {
  switch (status) {
    case "Confirmed":
      return "border-jabal-200 bg-jabal-50 text-jabal-700";
    case "Cancelled":
      return "border-crimson-200 bg-crimson-50 text-crimson-700";
    case "Completed":
      return "border-maroon-100 bg-maroon-50 text-maroon-500";
    default:
      return "border-maroon-200 bg-white text-maroon-800";
  }
}

export default function BookingsPage() {
  const { lang } = useLang();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<SourceFilter>("All");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .order("check_in", { ascending: false })
      .limit(1000);
    if (error) {
      setLoadError(true);
      setBookings([]);
    } else {
      setBookings(data ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (filter !== "All" && b.source !== filter) return false;
      if (!q) return true;
      return (
        b.ref.toLowerCase().includes(q) ||
        (b.guest ?? "").toLowerCase().includes(q) ||
        (b.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [bookings, filter, search]);

  async function changeStatus(booking: Booking, status: string) {
    const previous = booking.status;
    setUpdateError(false);
    setSavingId(booking.id);
    // Optimistic update, reverted on failure.
    setBookings((rows) =>
      rows.map((r) => (r.id === booking.id ? { ...r, status } : r))
    );
    const { error } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", booking.id);
    if (error) {
      setBookings((rows) =>
        rows.map((r) => (r.id === booking.id ? { ...r, status: previous } : r))
      );
      setUpdateError(true);
    }
    setSavingId(null);
  }

  return (
    <div>
      <PageHeader
        title={STR.title[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <Button onClick={() => router.push("/bookings/new")}>
            <Plus className="h-4 w-4" />
            {STR.newBooking[lang]}
          </Button>
        }
      />

      {/* Filters + search */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-maroon-800 bg-maroon-800 text-gold-100"
                    : "border-maroon-200 bg-white text-maroon-600 hover:bg-maroon-50"
                )}
              >
                {f === "All" ? COMMON.all[lang] : sourceLabel(f, lang)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <span className="text-xs font-semibold text-maroon-400">
              {filtered.length} {STR.countSuffix[lang]}
            </span>
          )}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={STR.searchPlaceholder[lang]}
            className="w-56 sm:w-64"
          />
        </div>
      </div>

      {(loadError || updateError) && (
        <div className="mb-4 rounded-lg border border-crimson-200 bg-crimson-50 px-4 py-3 text-sm font-semibold text-crimson-700">
          {loadError ? STR.loadError[lang] : STR.updateError[lang]}
        </div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-maroon-400">
            {COMMON.loading[lang]}
          </div>
        ) : bookings.length === 0 ? (
          <EmptyState
            icon={<BedDouble className="h-8 w-8" />}
            title={STR.emptyTitle[lang]}
            description={STR.emptyDesc[lang]}
            action={
              <Button onClick={() => router.push("/bookings/new")}>
                <Plus className="h-4 w-4" />
                {STR.newBooking[lang]}
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchX className="h-8 w-8" />}
            title={COMMON.noResults[lang]}
            description={STR.noMatchDesc[lang]}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{STR.ref[lang]}</TH>
                <TH>{STR.guest[lang]}</TH>
                <TH>{COMMON.phone[lang]}</TH>
                <TH>{COMMON.checkIn[lang]}</TH>
                <TH>{COMMON.checkOut[lang]}</TH>
                <TH>{COMMON.nights[lang]}</TH>
                <TH>{COMMON.roomType[lang]}</TH>
                <TH>{COMMON.source[lang]}</TH>
                <TH>{COMMON.status[lang]}</TH>
              </tr>
            </THead>
            <TBody>
              {filtered.map((b) => (
                <TR key={b.id} className="hover:bg-maroon-50/50">
                  <TD className="font-bold text-maroon-900">{b.ref}</TD>
                  <TD>{b.guest ?? "—"}</TD>
                  <TD>
                    <span dir="ltr" className="inline-block">
                      {b.phone ?? "—"}
                    </span>
                  </TD>
                  <TD>{formatDate(b.check_in, lang)}</TD>
                  <TD>{formatDate(b.check_out, lang)}</TD>
                  <TD>{nightsBetween(b.check_in, b.check_out)}</TD>
                  <TD>{roomTypeLabel(b.room_type, lang)}</TD>
                  <TD>
                    <Badge variant={sourceBadgeVariant(b.source)}>
                      {sourceLabel(b.source, lang)}
                    </Badge>
                  </TD>
                  <TD>
                    <select
                      value={b.status ?? "Confirmed"}
                      disabled={savingId === b.id}
                      onChange={(e) => void changeStatus(b, e.target.value)}
                      className={cn(
                        "h-8 rounded-full border px-2.5 text-xs font-semibold",
                        "focus:outline-none focus:ring-2 focus:ring-gold-200",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        statusSelectClass(b.status)
                      )}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s, lang)}
                        </option>
                      ))}
                    </select>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
