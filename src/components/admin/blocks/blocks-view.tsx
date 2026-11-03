"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Ban, Layers, Plus, Trash2 } from "lucide-react";
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
import { createBlock, deleteBlock, getCategoryInventory } from "@/app/(crm)/(app)/blocks/actions";
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

/** One room category (room type) and its sellable inventory for a date range. */
export interface CategoryInventory {
  room_type_id: string;
  /** Active rooms in the category. */
  total: number;
  /** Rooms free for every night of the range (0 when the category is blocked). */
  available: number;
  /** A whole-category block already covers at least one night of the range. */
  blocked: boolean;
}

const STR = {
  subtitle: { en: "Take rooms or whole types out of sale for maintenance, groups or owner use", ar: "أخرج غرفاً أو أنواعاً كاملة من البيع للصيانة أو المجموعات أو استخدام المالك" },
  target: { en: "Target", ar: "الهدف" },
  wholeType: { en: "Whole type", ar: "النوع بالكامل" },
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
  newRoomBlock: { en: "Block a room", ar: "إغلاق غرفة" },
  categories: { en: "Room categories", ar: "فئات الغرف" },
  categoriesHint: { en: "Rooms free to sell on the website for every night of the selected dates.", ar: "الغرف المتاحة للبيع على الموقع لكل ليلة من التواريخ المحددة." },
  category: { en: "Category", ar: "الفئة" },
  available: { en: "Available", ar: "المتاح" },
  status: { en: "Status", ar: "الحالة" },
  onSale: { en: "On sale", ar: "معروض للبيع" },
  blocked: { en: "Blocked", ar: "مغلق" },
  soldOut: { en: "Sold out", ar: "نفد" },
  noRooms: { en: "No rooms", ar: "لا توجد غرف" },
  blockCategory: { en: "Block category", ar: "إغلاق الفئة" },
  blockCategoryTitle: { en: "Block category from the website", ar: "إغلاق الفئة من الموقع" },
  blockCategoryDesc: {
    en: "Every room in this category will be closed for sale on the website for these nights. Existing bookings are not affected.",
    ar: "سيتم إغلاق جميع غرف هذه الفئة للبيع على الموقع في هذه الليالي. الحجوزات الحالية لن تتأثر.",
  },
  oneNight: { en: "night", ar: "ليلة" },
  manyNights: { en: "nights", ar: "ليالٍ" },
  roomsAvailable: { en: "rooms available", ar: "غرف متاحة" },
  loading: { en: "Loading…", ar: "جارٍ التحميل…" },
  maintenanceHint: { en: "Maintenance blocks also show the room greyed on the calendar.", ar: "إغلاقات الصيانة تظهر الغرفة بلون رمادي في التقويم." },
} satisfies Strings;

interface Props {
  today: string;
  role: Role;
  blocks: BlockRow[];
  inventory: CategoryInventory[];
  rooms: { id: string; room_number: string; room_type_id: string; status: string }[];
  types: { id: string; name_en: string; name_ar: string }[];
}

export function BlocksView({ today, blocks, inventory, rooms, types }: Props) {
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
            {STR.newRoomBlock[lang]}
          </Button>
        }
      />
      <CategoriesPanel today={today} inventory={inventory} types={types} />
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
                {STR.newRoomBlock[lang]}
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

function CategoriesPanel({ today, inventory, types }: { today: string; inventory: CategoryInventory[]; types: Props["types"] }) {
  const { lang } = useLang();
  const [startDate, setStartDate] = useState(today);
  const [nights, setNights] = useState(1);
  const [rows, setRows] = useState<CategoryInventory[]>(inventory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<CategoryInventory | null>(null);
  const reqId = useRef(0);
  const endDate = addDays(startDate, Math.max(1, nights));
  const isDefaultRange = startDate === today && nights === 1;
  const invById = useMemo(() => new Map(rows.map((r) => [r.room_type_id, r])), [rows]);

  const load = useCallback(async (start: string, end: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const r = await getCategoryInventory({ start_date: start, end_date: end });
    if (id !== reqId.current) return; // a newer request superseded this one
    setLoading(false);
    if (r.ok) setRows(r.data);
    else setError(r.error);
  }, []);

  // Server-rendered numbers cover tonight; fetch fresh ones for any other range.
  useEffect(() => {
    if (isDefaultRange) {
      reqId.current++;
      setLoading(false);
      setRows(inventory);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      void load(startDate, endDate);
    }
  }, [isDefaultRange, inventory, startDate, endDate, load]);

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-maroon-100 p-4">
        <div className="me-auto">
          <h2 className="flex items-center gap-2 text-sm font-bold text-maroon-900">
            <Layers className="h-4 w-4" />
            {STR.categories[lang]}
          </h2>
          <p className="mt-0.5 text-xs text-maroon-400">{STR.categoriesHint[lang]}</p>
        </div>
        <div>
          <Label htmlFor="cat-start">{STR.firstNight[lang]}</Label>
          <Input id="cat-start" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value || today)} />
        </div>
        <div className="w-24">
          <Label htmlFor="cat-nights">{STR.nights[lang]}</Label>
          <Input id="cat-nights" type="number" min={1} max={365} value={nights} onChange={(e) => setNights(Math.min(365, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
      </div>
      {error && (
        <div className="p-4 pb-0">
          <InlineAlert kind="error" message={error} />
        </div>
      )}
      <Table className={cn(loading && "opacity-60")}>
        <THead>
          <tr>
            <TH>{STR.category[lang]}</TH>
            <TH>{STR.available[lang]}</TH>
            <TH>{STR.status[lang]}</TH>
            <TH className="ltr:text-right rtl:text-left">{COMMON.actions[lang]}</TH>
          </tr>
        </THead>
        <TBody>
          {types.map((t) => {
            const inv = invById.get(t.id) ?? {
              room_type_id: t.id,
              total: 0,
              available: 0,
              blocked: false,
            };
            return (
              <TR key={t.id} data-testid="category-row">
                <TD className="font-semibold text-maroon-900">{localName(t, lang)}</TD>
                <TD>
                  <span data-testid="category-available" className={cn("font-bold", inv.available > 0 ? "text-jabal-700" : "text-crimson-700")}>
                    {inv.available}
                  </span>
                  <span className="text-maroon-400"> / {inv.total}</span>
                </TD>
                <TD>
                  {inv.blocked ? (
                    <Badge variant="red">{STR.blocked[lang]}</Badge>
                  ) : inv.total === 0 ? (
                    <Badge variant="gray">{STR.noRooms[lang]}</Badge>
                  ) : inv.available === 0 ? (
                    <Badge variant="gold">{STR.soldOut[lang]}</Badge>
                  ) : (
                    <Badge variant="green">{STR.onSale[lang]}</Badge>
                  )}
                </TD>
                <TD className="ltr:text-right rtl:text-left">
                  <Button size="sm" variant="outline" disabled={loading || inv.blocked || inv.total === 0} onClick={() => setBlocking(inv)}>
                    <Ban className="h-4 w-4" />
                    {STR.blockCategory[lang]}
                  </Button>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {loading && <p className="sr-only">{STR.loading[lang]}</p>}
      <BlockCategoryDialog
        target={blocking}
        type={blocking ? (types.find((t) => t.id === blocking.room_type_id) ?? null) : null}
        startDate={startDate}
        endDate={endDate}
        onClose={() => setBlocking(null)}
        onDone={() => {
          setBlocking(null);
          if (!isDefaultRange) void load(startDate, endDate);
        }}
      />
    </Card>
  );
}

function BlockCategoryDialog({ target, type, startDate, endDate, onClose, onDone }: { target: CategoryInventory | null; type: Props["types"][number] | null; startDate: string; endDate: string; onClose: () => void; onDone: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (target) {
      setReason("");
      setError(null);
    }
  }, [target]);

  if (!target) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    start(async () => {
      const r = await createBlock({
        room_id: null,
        room_type_id: target.room_type_id,
        start_date: startDate,
        end_date: endDate,
        kind: "stop_sell",
        reason: reason || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <Dialog open onClose={onClose} title={STR.blockCategoryTitle[lang]}>
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-lg border border-maroon-100 bg-maroon-50/40 p-3 text-sm">
          <p className="font-bold text-maroon-900">{localName(type, lang)}</p>
          <p className="mt-1 text-maroon-600">
            {fmtDate(startDate, lang)} → {fmtDate(endDate, lang)} · {nightsBetween(startDate, endDate)} {nightsBetween(startDate, endDate) === 1 ? STR.oneNight[lang] : STR.manyNights[lang]}
          </p>
          <p className="mt-1 text-maroon-600">
            {target.available} / {target.total} {STR.roomsAvailable[lang]}
          </p>
        </div>
        <p className="text-xs text-maroon-500">{STR.blockCategoryDesc[lang]}</p>
        <div>
          <Label htmlFor="bc-reason">{STR.reason[lang]}</Label>
          <Input id="bc-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </div>
        <InlineAlert kind="error" message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" variant="danger" loading={pending}>
            {STR.blockCategory[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
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
  const [f, setF] = useState({ room_id: rooms[0]?.id ?? "", start_date: today, nights: 1, kind: "block" as BlockKind, reason: "" });

  useEffect(() => {
    if (open) {
      setF({ room_id: rooms[0]?.id ?? "", start_date: today, nights: 1, kind: "block", reason: "" });
      setError(null);
    }
  }, [open, today, rooms]);

  if (!open) return null;
  const endDate = addDays(f.start_date, Math.max(1, f.nights));
  const typeById = new Map(types.map((t) => [t.id, t]));

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createBlock({
        room_id: f.room_id,
        room_type_id: null,
        start_date: f.start_date,
        end_date: endDate,
        kind: f.kind,
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
    <Dialog open onClose={onClose} title={STR.newRoomBlock[lang]}>
      <form onSubmit={submit} className="space-y-3">
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
