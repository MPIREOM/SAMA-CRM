"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkRoom } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createRoom, updateRoom } from "@/app/(crm)/(app)/rooms/actions";
import { InlineAlert } from "../load-error";
import { localName } from "../shared";
import { BED_TYPES, asBedType, bedLabel, type BedType } from "@/lib/booking-engine/beds";

const STR = {
  addTitle: { en: "Add room", ar: "إضافة غرفة" },
  editTitle: { en: "Edit room", ar: "تعديل الغرفة" },
  number: { en: "Room number", ar: "رقم الغرفة" },
  floor: { en: "Floor", ar: "الطابق" },
  sortOrder: { en: "Sort order", ar: "الترتيب" },
  beds: { en: "Beds", ar: "الأسرّة" },
  bedUnknown: { en: "— not recorded —", ar: "— غير مسجّل —" },
} satisfies Strings;

type Form = { room_number: string; room_type_id: string; floor: string; bed_type: BedType | ""; status: "active" | "maintenance"; notes: string; sort_order: number };

export function RoomDialog({
  room,
  types,
  onClose,
}: {
  room: BkRoom | "new" | null;
  types: { id: string; name_en: string; name_ar: string }[];
  onClose: () => void;
}) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ room_number: "", room_type_id: types[0]?.id ?? "", floor: "", bed_type: "", status: "active", notes: "", sort_order: 0 });

  useEffect(() => {
    setError(null);
    if (room && room !== "new") {
      setForm({
        room_number: room.room_number,
        room_type_id: room.room_type_id,
        floor: room.floor ?? "",
        bed_type: asBedType(room.bed_type) ?? "",
        status: room.status === "maintenance" ? "maintenance" : "active",
        notes: room.notes ?? "",
        sort_order: room.sort_order,
      });
    } else {
      setForm({ room_number: "", room_type_id: types[0]?.id ?? "", floor: "", bed_type: "", status: "active", notes: "", sort_order: 0 });
    }
  }, [room, types]);

  if (!room) return null;
  const isNew = room === "new";

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const payload = { ...form, floor: form.floor || null, bed_type: form.bed_type || null, notes: form.notes || null };
      const r = isNew ? await createRoom(payload) : await updateRoom({ id: (room as BkRoom).id, ...payload });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={isNew ? STR.addTitle[lang] : STR.editTitle[lang]}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="r-number">{STR.number[lang]}</Label>
            <Input id="r-number" value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} required autoFocus />
          </div>
          <div>
            <Label htmlFor="r-type">{COMMON.roomType[lang]}</Label>
            <Select id="r-type" value={form.room_type_id} onChange={(e) => setForm({ ...form, room_type_id: e.target.value })} required>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {localName(t, lang)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="r-floor">{STR.floor[lang]}</Label>
            <Input id="r-floor" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="r-bed">{STR.beds[lang]}</Label>
            <Select id="r-bed" value={form.bed_type} onChange={(e) => setForm({ ...form, bed_type: asBedType(e.target.value) ?? "" })}>
              <option value="">{STR.bedUnknown[lang]}</option>
              {BED_TYPES.map((bed) => (
                <option key={bed} value={bed}>
                  {bedLabel(bed, lang)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="r-sort">{STR.sortOrder[lang]}</Label>
            <Input id="r-sort" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} />
          </div>
          <div className="col-span-2">
            <Label htmlFor="r-status">{COMMON.status[lang]}</Label>
            <Select id="r-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value === "maintenance" ? "maintenance" : "active" })}>
              <option value="active">{COMMON.active[lang]}</option>
              <option value="maintenance">{COMMON.maintenance[lang]}</option>
            </Select>
          </div>
          <div className="col-span-2">
            <Label htmlFor="r-notes">{COMMON.notes[lang]}</Label>
            <Textarea id="r-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <InlineAlert kind="error" message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" loading={pending}>
            {isNew ? COMMON.add[lang] : COMMON.save[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
