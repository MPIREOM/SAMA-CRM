"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { addDays } from "@/lib/booking-engine/pricing";
import type { Role } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { STATUS_BAR_CLASS, statusLabel } from "../shared";
import { BookingDrawer } from "./booking-drawer";
import { CellChooser } from "./cell-chooser";
import { TapeChart, type CellTarget } from "./tape-chart";
import type { CalendarBlock, CalendarBooking, CalendarRoom, CalendarRoomType } from "./layout";

const STR = {
  subtitle: { en: "Rooms × nights — click a bar for actions, an empty cell to add", ar: "الغرف × الليالي — انقر على شريط للإجراءات أو خلية فارغة للإضافة" },
  days: { en: "days", ar: "يوم" },
  legendBlock: { en: "Block / maintenance", ar: "إغلاق / صيانة" },
  legendUnassigned: { en: "Unassigned", ar: "غير مخصص" },
  newBooking: { en: "New booking", ar: "حجز جديد" },
  prev: { en: "Previous week", ar: "الأسبوع السابق" },
  next: { en: "Next week", ar: "الأسبوع التالي" },
} satisfies Strings;

interface Props {
  from: string;
  days: number;
  today: string;
  role: Role;
  types: CalendarRoomType[];
  rooms: CalendarRoom[];
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
}

const DAY_OPTIONS = [14, 21, 28, 42];

export function CalendarView({ from, days, today, types, rooms, bookings, blocks }: Props) {
  const { lang } = useLang();
  const router = useRouter();
  const search = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cell, setCell] = useState<CellTarget | null>(null);

  const navigate = useCallback(
    (nextFrom: string, nextDays = days) => {
      const params = new URLSearchParams(search.toString());
      params.set("from", nextFrom);
      params.set("days", String(nextDays));
      router.push(`/calendar?${params.toString()}`);
    },
    [router, search, days]
  );

  // ← / → move the window when nothing is focused (keyboard-friendly front desk).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || selectedId || cell) return;
      if (e.key === "ArrowLeft") navigate(addDays(from, lang === "ar" ? 7 : -7));
      if (e.key === "ArrowRight") navigate(addDays(from, lang === "ar" ? -7 : 7));
      if (e.key.toLowerCase() === "t") navigate(addDays(today, -1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [from, today, navigate, selectedId, cell, lang]);

  const selected = selectedId ? (bookings.find((b) => b.id === selectedId) ?? null) : null;

  return (
    <div>
      <PageHeader
        title={COMMON.calendar[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <Button onClick={() => router.push("/reservations/new")}>
            <Plus className="h-4 w-4" />
            {STR.newBooking[lang]}
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label={STR.prev[lang]} onClick={() => navigate(addDays(from, -7))}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(addDays(today, -1))}>
            {COMMON.today[lang]}
          </Button>
          <Button variant="outline" size="sm" aria-label={STR.next[lang]} onClick={() => navigate(addDays(from, 7))}>
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
        <Input
          type="date"
          value={from}
          onChange={(e) => e.target.value && navigate(e.target.value)}
          className="h-8 w-40 text-xs"
          aria-label={COMMON.from[lang]}
        />
        <Select value={String(days)} onChange={(e) => navigate(from, Number(e.target.value))} className="h-8 w-28 text-xs">
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} {STR.days[lang]}
            </option>
          ))}
        </Select>

        <div className="ms-auto flex flex-wrap items-center gap-3 text-[11px] font-semibold text-maroon-500">
          {(["confirmed", "checked_in", "pending", "checked_out"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={`inline-block h-3 w-4 rounded-sm border ${STATUS_BAR_CLASS[s]}`} />
              {statusLabel(s, lang)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-3 w-4 rounded-sm border border-maroon-200"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(132,66,75,0.28) 0 3px, rgba(243,232,233,0.9) 3px 6px)" }}
            />
            {STR.legendBlock[lang]}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-4 rounded-sm border border-dashed border-gold-400 bg-gold-50" />
            {STR.legendUnassigned[lang]}
          </span>
        </div>
      </div>

      <TapeChart
        from={from}
        days={days}
        today={today}
        types={types}
        rooms={rooms}
        bookings={bookings}
        blocks={blocks}
        selectedId={selectedId}
        onSelectBooking={setSelectedId}
        onSelectCell={setCell}
      />

      <BookingDrawer booking={selected} rooms={rooms} types={types} today={today} onClose={() => setSelectedId(null)} />
      <CellChooser target={cell} onClose={() => setCell(null)} />
    </div>
  );
}
