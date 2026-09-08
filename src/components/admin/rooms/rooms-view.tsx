"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkRoom, BkRoomType } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { deleteRoom, updateRoom } from "@/app/(crm)/(app)/rooms/actions";
import { InlineAlert } from "../load-error";
import { fmtMoney, localName } from "../shared";
import { RoomTypeDialog, type RoomTypeRow } from "./room-type-dialog";
import { RoomDialog } from "./room-dialog";

const STR = {
  subtitle: { en: "Room types shown on the website and the physical rooms behind them", ar: "أنواع الغرف المعروضة على الموقع والغرف الفعلية خلفها" },
  tabTypes: { en: "Room types", ar: "أنواع الغرف" },
  tabRooms: { en: "Rooms", ar: "الغرف" },
  units: { en: "rooms", ar: "غرف" },
  base: { en: "Base rate", ar: "السعر الأساسي" },
  capacity: { en: "Capacity", ar: "السعة" },
  images: { en: "photos", ar: "صور" },
  addRoom: { en: "Add room", ar: "إضافة غرفة" },
  number: { en: "Room no.", ar: "رقم الغرفة" },
  floor: { en: "Floor", ar: "الطابق" },
  activeToggle: { en: "Active (off = maintenance)", ar: "نشطة (إيقاف = صيانة)" },
  noRooms: { en: "No rooms yet", ar: "لا توجد غرف بعد" },
  noRoomsDesc: { en: "Add the physical rooms so bookings can be assigned.", ar: "أضف الغرف الفعلية حتى يمكن تخصيص الحجوزات." },
  confirmDelete: { en: "Delete this room? Only possible when no booking references it.", ar: "حذف هذه الغرفة؟ ممكن فقط إذا لم يكن هناك حجز مرتبط بها." },
  sortOrder: { en: "Order", ar: "الترتيب" },
} satisfies Strings;

export function RoomsView({ tab, types, rooms }: { tab: "types" | "rooms"; types: RoomTypeRow[]; rooms: BkRoom[] }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editType, setEditType] = useState<RoomTypeRow | null>(null);
  const [editRoom, setEditRoom] = useState<BkRoom | "new" | null>(null);

  function setTab(next: "types" | "rooms") {
    router.push(`/rooms?tab=${next}`);
  }

  function toggleRoom(room: BkRoom, active: boolean) {
    setError(null);
    start(async () => {
      const r = await updateRoom({ id: room.id, status: active ? "active" : "maintenance" });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function removeRoom(room: BkRoom) {
    if (!window.confirm(STR.confirmDelete[lang])) return;
    setError(null);
    start(async () => {
      const r = await deleteRoom({ id: room.id });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  const roomCount = new Map<string, number>();
  for (const r of rooms) roomCount.set(r.room_type_id, (roomCount.get(r.room_type_id) ?? 0) + 1);
  const typeById = new Map(types.map((t) => [t.id, t]));

  return (
    <div>
      <PageHeader
        title={COMMON.rooms[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          tab === "rooms" ? (
            <Button onClick={() => setEditRoom("new")}>
              <Plus className="h-4 w-4" />
              {STR.addRoom[lang]}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex gap-1 rounded-lg bg-maroon-100/60 p-1 w-fit">
        {(["types", "rooms"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
              tab === t ? "bg-white text-maroon-900 shadow-card" : "text-maroon-500 hover:text-maroon-800"
            )}
          >
            {t === "types" ? STR.tabTypes[lang] : STR.tabRooms[lang]} ({t === "types" ? types.length : rooms.length})
          </button>
        ))}
      </div>

      <div className="mb-4">
        <InlineAlert kind="error" message={error} />
      </div>

      {tab === "types" ? (
        types.length === 0 ? (
          <Card>
            <EmptyState icon={<BedDouble className="h-8 w-8" />} title={COMMON.noResults[lang]} />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {types.map((t) => (
              <Card key={t.id} className={cn("flex gap-4 p-4", !t.is_active && "opacity-70")}>
                <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-maroon-100">
                  {t.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-maroon-300">
                      <BedDouble className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-maroon-900">{localName(t, lang)}</p>
                      <p className="truncate text-xs text-maroon-400">{lang === "ar" ? t.tagline_ar : t.tagline_en}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setEditType(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {COMMON.edit[lang]}
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <Badge variant={t.is_active ? "green" : "gray"}>{t.is_active ? COMMON.active[lang] : COMMON.inactive[lang]}</Badge>
                    <Badge variant="outline">
                      {roomCount.get(t.id) ?? 0} {STR.units[lang]}
                    </Badge>
                    <Badge variant="gold">
                      {STR.base[lang]} {fmtMoney(t.base_rate_omr, lang)}
                    </Badge>
                    <Badge variant="outline">
                      {STR.capacity[lang]} {t.max_adults}+{t.max_children}
                    </Badge>
                    <Badge variant="outline">
                      {t.images.length} {STR.images[lang]}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card className="overflow-hidden">
          {rooms.length === 0 ? (
            <EmptyState
              icon={<DoorOpen className="h-8 w-8" />}
              title={STR.noRooms[lang]}
              description={STR.noRoomsDesc[lang]}
              action={
                <Button onClick={() => setEditRoom("new")}>
                  <Plus className="h-4 w-4" />
                  {STR.addRoom[lang]}
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{STR.number[lang]}</TH>
                  <TH>{COMMON.roomType[lang]}</TH>
                  <TH>{STR.floor[lang]}</TH>
                  <TH>{STR.sortOrder[lang]}</TH>
                  <TH>{COMMON.status[lang]}</TH>
                  <TH>{COMMON.notes[lang]}</TH>
                  <TH className="ltr:text-right rtl:text-left">{COMMON.actions[lang]}</TH>
                </tr>
              </THead>
              <TBody>
                {rooms.map((r) => (
                  <TR key={r.id} className={cn(r.status === "maintenance" && "bg-stone-50")}>
                    <TD className="font-bold text-maroon-900">{r.room_number}</TD>
                    <TD>{localName(typeById.get(r.room_type_id) ?? null, lang)}</TD>
                    <TD>{r.floor ?? "—"}</TD>
                    <TD className="text-maroon-400">{r.sort_order}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Switch checked={r.status === "active"} disabled={pending} onCheckedChange={(v) => toggleRoom(r, v)} label={STR.activeToggle[lang]} />
                        <span className={cn("text-xs font-semibold", r.status === "active" ? "text-jabal-700" : "text-stone-700")}>
                          {r.status === "active" ? COMMON.active[lang] : COMMON.maintenance[lang]}
                        </span>
                      </div>
                    </TD>
                    <TD className="max-w-[16rem] truncate text-maroon-500">{r.notes ?? ""}</TD>
                    <TD className="ltr:text-right rtl:text-left">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditRoom(r)} aria-label={COMMON.edit[lang]}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-crimson-700" disabled={pending} onClick={() => removeRoom(r)} aria-label={COMMON.delete[lang]}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      <RoomTypeDialog type={editType} onClose={() => setEditType(null)} />
      <RoomDialog room={editRoom} types={types} onClose={() => setEditRoom(null)} />
    </div>
  );
}
