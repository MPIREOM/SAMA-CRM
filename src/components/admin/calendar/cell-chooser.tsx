"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Ban } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { addDays } from "@/lib/booking-engine/pricing";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createBlock } from "@/app/(crm)/(app)/blocks/actions";
import { InlineAlert } from "../load-error";
import { BLOCK_KINDS, blockKindLabel, fmtDate } from "../shared";
import type { CellTarget } from "./tape-chart";

const STR = {
  title: { en: "New on this day", ar: "جديد في هذا اليوم" },
  newBooking: { en: "New booking", ar: "حجز جديد" },
  newBlock: { en: "New block", ar: "إغلاق جديد" },
  bookingHint: { en: "Opens the booking form with this room and date pre-filled.", ar: "يفتح نموذج الحجز مع تعبئة الغرفة والتاريخ." },
  nights: { en: "Nights", ar: "الليالي" },
  until: { en: "until", ar: "حتى" },
  reason: { en: "Reason (optional)", ar: "السبب (اختياري)" },
  createBlock: { en: "Create block", ar: "إنشاء الإغلاق" },
} satisfies Strings;

export function CellChooser({ target, onClose }: { target: CellTarget | null; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"choose" | "block">("choose");
  const [nights, setNights] = useState(1);
  const [kind, setKind] = useState<(typeof BLOCK_KINDS)[number]>("block");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setMode("choose");
    setNights(1);
    setKind("block");
    setReason("");
    setError(null);
    onClose();
  }

  if (!target) return null;
  const endDate = addDays(target.date, Math.max(1, nights));

  return (
    <Dialog open onClose={close} title={`${STR.title[lang]} · ${target.roomNumber} · ${fmtDate(target.date, lang)}`}>
      {mode === "choose" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/reservations/new?room_type=${target.roomTypeId}&room=${target.roomId}&check_in=${target.date}&check_out=${addDays(target.date, 1)}`
              )
            }
            className="flex flex-col items-start gap-2 rounded-xl border border-maroon-200 p-4 text-start hover:border-gold-500 hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-maroon-800 text-gold-100">
              <CalendarPlus className="h-5 w-5" />
            </span>
            <span className="font-bold text-maroon-900">{STR.newBooking[lang]}</span>
            <span className="text-xs text-maroon-400">{STR.bookingHint[lang]}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("block")}
            className="flex flex-col items-start gap-2 rounded-xl border border-maroon-200 p-4 text-start hover:border-gold-500 hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-200 text-stone-800">
              <Ban className="h-5 w-5" />
            </span>
            <span className="font-bold text-maroon-900">{STR.newBlock[lang]}</span>
            <span className="text-xs text-maroon-400">{blockKindLabel("block", lang)} / {blockKindLabel("maintenance", lang)}</span>
          </button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await createBlock({
                room_id: target.roomId,
                start_date: target.date,
                end_date: endDate,
                kind,
                reason,
              });
              if (!r.ok) {
                setError(r.error);
                return;
              }
              router.refresh();
              close();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="chooser-kind">{COMMON.kind[lang]}</Label>
              <Select id="chooser-kind" value={kind} onChange={(e) => setKind(e.target.value as (typeof BLOCK_KINDS)[number])}>
                {BLOCK_KINDS.filter((k) => k !== "stop_sell").map((k) => (
                  <option key={k} value={k}>
                    {blockKindLabel(k, lang)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="chooser-nights">{STR.nights[lang]}</Label>
              <Input
                id="chooser-nights"
                type="number"
                min={1}
                max={365}
                value={nights}
                onChange={(e) => setNights(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
              <p className="mt-1 text-xs text-maroon-400">
                {STR.until[lang]} {fmtDate(endDate, lang)}
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="chooser-reason">{STR.reason[lang]}</Label>
            <Input id="chooser-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </div>
          <InlineAlert kind="error" message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMode("choose")} disabled={pending}>
              {COMMON.back[lang]}
            </Button>
            <Button type="submit" loading={pending}>
              {STR.createBlock[lang]}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
