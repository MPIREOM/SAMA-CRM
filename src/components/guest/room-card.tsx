import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight, Users } from "lucide-react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { formatRate, n, type LocalizedRoom } from "./lib";

// Teaser card used on the home page and the /rooms grid.

export function RoomCard({ room, priority = false, className }: { room: LocalizedRoom; priority?: boolean; className?: string }) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  return (
    <article className={cn("g-card group flex flex-col overflow-hidden", className)}>
      <Link href={`/rooms/${room.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500" tabIndex={-1} aria-hidden="true">
        <Image
          src={room.images[0]}
          alt=""
          fill
          priority={priority}
          sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="g-h3">
            <Link href={`/rooms/${room.slug}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 rounded-sm">
              {room.name}
            </Link>
          </h3>
        </div>
        {room.tagline && <p className="mt-1.5 text-sm leading-relaxed text-maroon-700">{room.tagline}</p>}
        <div className="mt-4 flex items-center gap-2 text-sm text-maroon-600">
          <Users className="h-4 w-4 text-gold-700" aria-hidden="true" />
          <span>{t("sleepsShort", { a: n(room.maxAdults), c: n(room.maxChildren) })}</span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="text-maroon-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("from")}</span>
            <span dir="ltr" className="ms-1.5 text-2xl font-extrabold tabular-nums">
              <span className="text-sm font-bold text-gold-700">{tc("omr")}</span> {formatRate(room.baseRate)}
            </span>
            <span className="ms-1 text-sm text-maroon-600">/ {t("perNight")}</span>
          </p>
          <Link href={`/rooms/${room.slug}`} className="g-btn-outline g-btn-sm shrink-0">
            {t("viewRoom")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
