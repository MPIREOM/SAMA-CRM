import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { formatRate, n, type LocalizedRoom } from "./lib";

// Room teaser: a tall photo, the name in serif, one line of facts and the
// price. Used on the home page grid and under "Other rooms".

export function RoomCard({ room, priority = false, className }: { room: LocalizedRoom; priority?: boolean; className?: string }) {
  const t = useTranslations("rooms");
  const tc = useTranslations("common");
  const facts = [t("sleepsShort", { a: n(room.maxAdults), c: n(room.maxChildren), adults: room.maxAdults, children: room.maxChildren }), room.sizeSqm ? t("sizeSqm", { n: n(room.sizeSqm) }) : null, room.view || null].filter(Boolean);

  return (
    <article className={cn("group flex flex-col", className)}>
      <Link
        href={`/rooms/${room.slug}`}
        className="g-frame g-zoom block aspect-[4/5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
        tabIndex={-1}
        aria-hidden="true"
      >
        <Image src={room.images[0]} alt="" fill priority={priority} sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
      </Link>
      <div className="flex flex-1 flex-col pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="g-h4">
            <Link href={`/rooms/${room.slug}`} className="rounded-sm transition-colors hover:text-maroon-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
              {room.name}
            </Link>
          </h3>
          <p className="shrink-0 text-end leading-none" dir="ltr">
            <span className="g-eyebrow me-1.5 text-[10px]">{t("from")}</span>
            <span className="g-price text-xl">
              {tc("omr")} {formatRate(room.baseRate)}
            </span>
          </p>
        </div>
        <p className="mt-2 text-sm text-ink-mute">{facts.join(" · ")}</p>
        {room.tagline && <p className="g-body mt-3 line-clamp-2 text-[15px]">{room.tagline}</p>}
        <div className="mt-auto pt-5">
          <Link href={`/rooms/${room.slug}`} className="g-link">
            {t("viewRoom")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-400 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
