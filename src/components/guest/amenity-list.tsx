import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { AmenityKey } from "./lib";

// Room amenities as a quiet columned list: a thin gold check and the name.

export function AmenityList({ amenities, columns = 2 }: { amenities: AmenityKey[]; columns?: 2 | 3 }) {
  const t = useTranslations("amenities");
  return (
    <ul className={columns === 3 ? "grid grid-cols-2 gap-x-6 gap-y-3.5 sm:gap-x-8 lg:grid-cols-3" : "grid grid-cols-2 gap-x-6 gap-y-3.5 sm:gap-x-8"}>
      {amenities.map((key) => (
        <li key={key} className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
          <Check className="mt-1 h-4 w-4 shrink-0 text-gold-600" strokeWidth={1.5} aria-hidden="true" />
          <span>{t(key)}</span>
        </li>
      ))}
    </ul>
  );
}
