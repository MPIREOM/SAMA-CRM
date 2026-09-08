"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { n } from "./lib";

// Main image + thumbnail strip. Keeps a fixed aspect ratio so switching
// photos never moves the page.

export function RoomGallery({ images, name }: { images: string[]; name: string }) {
  const t = useTranslations("rooms");
  const [active, setActive] = useState(0);
  const current = images[Math.min(active, images.length - 1)];

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-stone-100 sm:aspect-[16/10]">
        {images.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt={t("imageAlt", { name, n: n(i + 1) })}
            fill
            priority={i === 0}
            sizes="(min-width: 1024px) 720px, 100vw"
            className={cn("object-cover transition-opacity duration-300", src === current ? "opacity-100" : "opacity-0")}
            aria-hidden={src !== current}
          />
        ))}
      </div>
      {images.length > 1 && (
        <ul className="mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-thin" aria-label={t("gallery")}>
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={t("showPhoto", { n: n(i + 1) })}
                aria-pressed={i === active}
                className={cn(
                  "relative block h-16 w-24 overflow-hidden rounded-xl border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 sm:h-20 sm:w-28",
                  i === active ? "border-gold-500" : "border-transparent opacity-80 hover:opacity-100"
                )}
              >
                <Image src={src} alt="" fill sizes="112px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
