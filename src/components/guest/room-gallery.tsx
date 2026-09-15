"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Lightbox } from "./lightbox";
import { n } from "./lib";

// One large photo that crossfades, a strip of thumbnails beneath it, and a
// full-screen viewer. The frame keeps a fixed aspect ratio so switching
// photos never moves the page.

export function RoomGallery({ images, name }: { images: string[]; name: string }) {
  const t = useTranslations("rooms");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const total = images.length;
  const current = Math.min(active, total - 1);

  return (
    <div>
      <div className="g-frame g-zoom aspect-[4/3] sm:aspect-[16/10]">
        {images.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt={t("imageAlt", { name, n: n(i + 1) })}
            fill
            priority={i === 0}
            sizes="(min-width: 1024px) 840px, 100vw"
            className={cn("object-cover transition-opacity duration-700 ease-out motion-reduce:transition-none", i === current ? "opacity-100" : "opacity-0")}
            aria-hidden={i !== current}
          />
        ))}
        {/* The whole photo opens the viewer; the tag is only a hint. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("openPhoto", { n: n(current + 1), total: n(total) })}
          className="absolute inset-0 z-10 flex cursor-zoom-in items-end justify-end p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500 sm:p-5"
        >
          <span className="g-tag-dark gap-2" aria-hidden="true">
            <Maximize2 className="h-3 w-3" strokeWidth={1.75} />
            <span dir="ltr" className="tabular-nums">
              {n(current + 1)} / {n(total)}
            </span>
          </span>
        </button>
      </div>

      {total > 1 && (
        <ul className="-mx-1 mt-4 flex gap-3 overflow-x-auto px-1 py-1.5 scrollbar-none" aria-label={t("gallery")}>
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={t("showPhoto", { n: n(i + 1) })}
                aria-pressed={i === current}
                className={cn(
                  "g-frame block aspect-[4/3] w-[4.75rem] transition-opacity duration-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper sm:w-24",
                  i === current ? "opacity-100 ring-1 ring-ink ring-offset-2 ring-offset-paper" : "opacity-55 hover:opacity-100"
                )}
              >
                <Image src={src} alt="" fill sizes="96px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Lightbox images={images} name={name} index={open ? current : null} onClose={() => setOpen(false)} onChange={setActive} />
    </div>
  );
}
