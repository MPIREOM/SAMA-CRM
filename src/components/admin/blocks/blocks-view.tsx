"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Ban, Plus, Trash2 } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { Role } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { addDays, nightsBetween } from "@/lib/booking-engine/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { createBlock, deleteBlock } from "@/app/(crm)/(app)/blocks/actions";
import { InlineAlert } from "../load-error";
import { BLOCK_KINDS, blockKindLabel, fmtDate, localName, type BlockKind } from "../shared";

export interface BlockRow {
  id: string;
  room_id: string | null;
  room_type_id: string | null;
  room_number: string | null;
  start_date: string;
  end_date: string;
  kind: string;
  reason: string | null;
  created_at: string;
}

const STR = {
  subtitle: { en: "Take rooms or whole types out of sale for maintenance, groups or owner use", ar: "أخرج غرفاً أو أنواعاً كاملة من البيع للصيانة أو المجموعات أو استخدام المالك" },
  newBlock: { en: "New block", ar: "إغلاق جديد" },
  target: { en: "Target", ar: "الهدف" },
  wholeType: { en: "Whole type", ar: "النوع بالكامل" },
  scopeRoom: { en: "One room", ar: "غرفة واحدة" },
  scopeType: { en: "Whole room type (stop sell)", ar: "نوع الغرفة بالكامل (إيقاف البيع)" },
  firstNight: { en: "First night", ar: "أول ليلة" },
  nights: { en: "Nights", ar: "الليالي" },
  lastNightHint: { en: "Sellable again from", ar: "يعود للبيع من" },
  reason: { en: "Reason (optional)", ar: "السبب (اختياري)" },
  upcoming: { en: "Upcoming & current", ar: "القادمة والحالية" },
  past: { en: "Past", ar: "السابقة" },
  noBlocks: { en: "No blocks", ar: "لا توجد إغلاقات" },
  noBlocksDesc: { en: "Everything is on sale. Add a block to take a room or a type out of inventory.", ar: "كل شيء معروض للبيع. أضف إغلاقاً لإخراج غرفة أو نوع من المخزون." },
  confirmDelete: { en: "Remove this block?", ar: "إزالة هذا الإغلاق؟" },
  showPast: { en: "Show past blocks", ar: "عرض الإغلاقات السابقة" },
  maintenanceHint: { en: "Maintenance blocks also show the room greyed on the calendar.", ar: "إغلاقات الصيانة تظهر الغرفة بلون رمادي في التقويم." },
} satisfies Strings;

interface Props {
  today: string;
  role: Role;
  blocks: BlockRow[];
  rooms: { id: string; room_number: string; room_type_id: string; status: string }[];
  types: { id: string; name_en: string; name_ar: string }[];
}

export function BlocksView({ today, blocks, rooms, types }: Props) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const upcoming = blocks.filter((b) => b.end_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = blocks.filter((b) => b.end_date <= today).sort((a, b) => b.start_date.localeCompare(a.start_date));

  function remove(b: BlockRow) {
    if (!window.confirm(STR.confirmDelete[lang])) return;
    setError(null);
    start(async () => {
      const r = await deleteBlock({ id: b.id });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  const rows = showPast ? [...upcoming, ...past] : upcoming;

  return (
    <div>
      <PageHeader
        title={COMMON.blocks[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {STR.newBlock[lang]}
          </Button>
        }
      />
      <div className="mb-4 flex items-center justify-between gap-3">
        <InlineAlert kind="error" message={error} />
        <label className="ms-auto inline-flex items-center gap-2 text-xs font-semibold text-maroon-500">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="accent-maroon-800" />
          {STR.showPast[lang]} ({past.length})
        </label>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Ban className="h-8 w-8" />}
            title={STR.noBlocks[lang]}
            description={STR.noBlocksDesc[lang]}
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {STR.newBlock[lang]}
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{STR.target[lang]}</TH>
                <TH>{COMMON.kind[lang]}</TH>
                <TH>{COMMON.from[lang]}</TH>
                <TH>{COMMON.to[lang]}</TH>
                <TH>{STR.nights[lang]}</TH>
                <TH>{COMMON.reason[lang]}</TH>
                <TH className="ltr:text-right rtl:text-left">{COMMON.actions[lang]}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((b) => {
                const isPast = b.end_date <= today;
                const current = b.start_date <= today && b.end_date > today;
                return (
                  <TR key={b.id} className={cn(isPast && "opacity-50", current && "bg-gold-50/40")}>
                    <TD>
                      {b.room_id ? (
                        <>
                          <span className="font-bold text-maroon-900">{b.room_number ?? "—"}</span>
                          <span className="ms-2 text-xs text-maroon-400">{localName(typeById.get(b.room_type_id ?? "") ?? null, lang)}</span>
                        </>
                      ) : (
                        <>
                          <Badge variant="gold">{STR.wholeType[lang]}</Badge>
                          <span className="ms-2 font-semibold text-maroon-900">{localName(typeById.get(b.room_type_id ?? "") ?? null, lang)}</span>
                        </>
                      )}
                    </TD>
                    <TD>
                      <Badge variant={b.kind === "stop_sell" ? "red" : b.kind === "maintenance" ? "gray" : "outline"}>{blockKindLabel(b.kind, lang)}</Badge>
                    </TD>
                    <TD>{fmtDate(b.start_date, lang)}</TD>
                    <TD>{fmtDate(b.end_date, lang)}</TD>
                    <TD>{nightsBetween(b.start_date, b.end_date)}</TD>
                    <TD className="max-w-[16rem] truncate text-maroon-500">{b.reason ?? ""}</TD>
                    <TD className="ltr:text-right rtl:text-left">
                      <Button size="sm" variant="ghost" className="text-crimson-700" disabled={pending} onClick={() => remove(b)} aria-label={COMMON.delete[lang]}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <NewBlockDialog open={open} today={today} rooms={rooms} types={types} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewBlockDialog({
  open,
  today,
  rooms,
  types,
  onClose,
}: {
  open: boolean;
  today: string;
  rooms: Props["rooms"];
  types: Props["types"];
  onClose: () => void;
}) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ scope: "room" as "room" | "type", room_id: rooms[0]?.id ?? "", room_type_id: types[0]?.id ?? "", start_date: today, nights: 1, kind: "block" as BlockKind, reason: "" });

  useEffect(() => {
    if (open) {
      setF({ scope: "room", room_id: rooms[0]?.id ?? "", room_type_id: types[0]?.id ?? "", start_date: today, nights: 1, kind: "block", reason: "" });
      setError(null);
    }
  }, [open, today, rooms, types]);

  if (!open) return null;
  const endDate = addDays(f.start_date, Math.max(1, f.nights));
  const typeById = new Map(types.map((t) => [t.id, t]));

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createBlock({
        room_id: f.scope === "room" ? f.room_id : null,
        room_type_id: f.scope === "type" ? f.room_type_id : null,
        start_date: f.start_date,
        end_date: endDate,
        kind: f.scope === "type" ? "stop_sell" : f.kind,
        reason: f.reason || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={STR.newBlock[lang]}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="bl-scope">{STR.target[lang]}</Label>
          <Select id="bl-scope" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value === "type" ? "type" : "room" })}>
            <option value="room">{STR.scopeRoom[lang]}</option>
            <option value="type">{STR.scopeType[lang]}</option>
          </Select>
        </div>
        {f.scope === "room" ? (
          <div>
            <Label htmlFor="bl-room">{COMMON.room[lang]}</Label>
            <Select id="bl-room" value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })} required>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.room_number} · {localName(typeById.get(r.room_type_id) ?? null, lang)}
                  {r.status === "maintenance" ? ` (${COMMON.maintenance[lang]})` : ""}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div>
            <Label htmlFor="bl-type">{COMMON.roomType[lang]}</Label>
            <Select id="bl-type" value={f.room_type_id} onChange={(e) => setF({ ...f, room_type_id: e.target.value })} required>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {localName(t, lang)}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="bl-start">{STR.firstNight[lang]}</Label>
            <Input id="bl-start" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="bl-nights">{STR.nights[lang]}</Label>
            <Input id="bl-nights" type="number" min={1} max={365} value={f.nights} onChange={(e) => setF({ ...f, nights: Math.max(1, Number(e.target.value) || 1) })} />
            <p className="mt-1 text-xs text-maroon-400">
              {STR.lastNightHint[lang]} {fmtDate(endDate, lang)}
            </p>
          </div>
          {f.scope === "room" && (
            <div className="col-span-2">
              <Label htmlFor="bl-kind">{COMMON.kind[lang]}</Label>
              <Select id="bl-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as BlockKind })}>
                {BLOCK_KINDS.filter((k) => k !== "stop_sell").map((k) => (
                  <option key={k} value={k}>
                    {blockKindLabel(k, lang)}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-maroon-400">{STR.maintenanceHint[lang]}</p>
            </div>
          )}
          <div className="col-span-2">
            <Label htmlFor="bl-reason">{STR.reason[lang]}</Label>
            <Input id="bl-reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} />
          </div>
        </div>
        <InlineAlert kind="error" message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" loading={pending}>
            {COMMON.create[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
