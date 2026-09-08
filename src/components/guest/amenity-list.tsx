import { useTranslations } from "next-intl";
import {
  Bath,
  BedDouble,
  Building2,
  Coffee,
  Fan,
  Flame,
  Flower2,
  Lock,
  Mountain,
  Refrigerator,
  Shirt,
  Sofa,
  Sparkles,
  Sun,
  Tv,
  Users,
  Utensils,
  Waves,
  Wifi,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { AmenityKey } from "./lib";

const ICONS: Record<AmenityKey, LucideIcon> = {
  wifi: Wifi,
  ac: Fan,
  heating: Flame,
  balcony: Sun,
  tv: Tv,
  tea_coffee: Coffee,
  minibar: Refrigerator,
  safe: Lock,
  hairdryer: Wind,
  toiletries: Sparkles,
  room_service: Utensils,
  mountain_view: Mountain,
  pool_view: Waves,
  city_view: Building2,
  family: Users,
  jacuzzi: Bath,
  sitting_area: Sofa,
  two_bathrooms: Bath,
  private_garden: Flower2,
  bathrobe: Shirt,
};

export function AmenityList({ amenities, columns = 2 }: { amenities: AmenityKey[]; columns?: 2 | 3 }) {
  const t = useTranslations("amenities");
  return (
    <ul className={columns === 3 ? "grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-x-6 gap-y-3 sm:grid-cols-2"}>
      {amenities.map((key) => {
        const Icon = ICONS[key] ?? BedDouble;
        return (
          <li key={key} className="flex items-center gap-3 text-maroon-800">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-gold-700">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold">{t(key)}</span>
          </li>
        );
      })}
    </ul>
  );
}
