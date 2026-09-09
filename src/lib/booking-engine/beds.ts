// Bed layouts a guest can choose for a room type ("twin beds or king bed").
// Pure: shared by the guest site, the back-office and the message templates.
//
// - bk_room_types.bed_options: the layouts the guest may pick from (empty =
//   the type has one fixed layout, described by bed_config_en/ar).
// - bk_rooms.bed_type: the physical layout of one room (staff-maintained).
// - bk_bookings.bed_preference: what the guest chose; staff assign a room
//   with that layout. Availability stays per room type.

export type BedType = "twin" | "king";
export const BED_TYPES: readonly BedType[] = ["twin", "king"];

export function isBedType(value: unknown): value is BedType {
  return value === "twin" || value === "king";
}

export function asBedType(value: unknown): BedType | null {
  return isBedType(value) ? value : null;
}

/** Only the known layouts, in canonical order, without duplicates. */
export function cleanBedOptions(values: readonly unknown[] | null | undefined): BedType[] {
  const set = new Set<BedType>();
  for (const v of values ?? []) if (isBedType(v)) set.add(v);
  return BED_TYPES.filter((b) => set.has(b));
}

const LABELS: Record<BedType, { en: string; ar: string }> = {
  twin: { en: "Twin beds", ar: "سريران منفصلان" },
  king: { en: "King bed", ar: "سرير كينغ" },
};

export function bedLabel(type: BedType, locale: "en" | "ar"): string {
  return LABELS[type][locale];
}

/** "Twin beds or king bed — your choice" when a type offers more than one layout, else null. */
export function bedChoiceText(options: readonly BedType[], locale: "en" | "ar"): string | null {
  if (options.length < 2) return null;
  const names = options.map((o) => bedLabel(o, locale));
  return locale === "ar" ? `${names.join(" أو ")} — حسب اختياركم` : `${names.map((s) => s.toLowerCase()).join(" or ")} — your choice`.replace(/^./, (c) => c.toUpperCase());
}

/**
 * Order rooms for assignment: rooms with the guest's layout first, rooms whose
 * layout is unknown next, the other layout last; room number within each.
 */
export function sortRoomsForBed<T extends { room_number: string; bed_type: string | null }>(rooms: readonly T[], preference: BedType | null | undefined): T[] {
  const rank = (r: T) => (!preference ? 0 : r.bed_type === preference ? 0 : r.bed_type === null ? 1 : 2);
  return [...rooms].sort((a, b) => rank(a) - rank(b) || a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));
}
