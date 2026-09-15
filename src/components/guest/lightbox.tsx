"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { n } from "./lib";

// Full-screen photo viewer for the room gallery: an ink overlay, one big
// photo, previous / next (buttons, arrow keys, swipe) and Escape to close.
// Focus stays inside the dialog while it is open and returns to the opener
// afterwards. Rendered through a portal so a transformed ancestor (Reveal)
// can never trap the fixed overlay. No library: it is a hundred lines.

export interface LightboxProps {
  images: string[];
  /** Names the dialog and the photos. */
  name: string;
  /** Photo to show; null keeps the viewer closed. */
  index: number | null;
  onClose: () => void;
  onChange: (index: number) => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const SWIPE_PX = 48;

export function Lightbox({ images, name, index, onClose, onChange }: LightboxProps) {
  const t = useTranslations("rooms");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);
  const touchX = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const total = images.length;
  const open = index !== null && total > 0;
  const current = open ? Math.min(Math.max(index, 0), total - 1) : 0;

  // "Next" in reading direction: mirrored for Arabic so the arrows, the keys
  // and a swipe all move the same way the page reads.
  const step = useCallback(
    (delta: number) => {
      if (total < 2) return;
      onChange((current + delta + total) % total);
    },
    [current, total, onChange]
  );
  const stepRef = useRef(step);
  stepRef.current = step;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Scroll lock + focus management for the lifetime of one opening.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, [open]);

  // Keys: Escape closes, arrows move, Tab cycles inside the dialog.
  useEffect(() => {
    if (!open) return;
    const rtl = document.documentElement.dir === "rtl";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepRef.current(rtl ? -1 : 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepRef.current(rtl ? 1 : -1);
      } else if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const inside = active instanceof Node && root.contains(active);
        if (e.shiftKey ? active === first || !inside : active === last || !inside) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchX.current;
    touchX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start === null || end === undefined) return;
    const dx = end - start;
    if (Math.abs(dx) < SWIPE_PX) return;
    const rtl = document.documentElement.dir === "rtl";
    // A swipe drags the next photo in from the far side.
    step((dx < 0 ? 1 : -1) * (rtl ? -1 : 1));
  }

  if (!mounted || !open) return null;

  const navBtn =
    "inline-flex h-11 w-11 items-center justify-center rounded-[3px] border border-paper/40 text-paper transition-colors duration-300 hover:border-paper hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("lightboxTitle", { name })}
      className="g-fade fixed inset-0 z-[95] flex flex-col bg-ink text-paper"
    >
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <p className="g-eyebrow text-paper/70">
          <span className="sr-only" aria-live="polite">
            {t("photoOf", { n: n(current + 1), total: n(total) })}
          </span>
          <span aria-hidden="true" dir="ltr" className="tabular-nums">
            {n(current + 1)} / {n(total)}
          </span>
        </p>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t("closePhotos")} className={navBtn}>
          <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      {/* Stage: tapping the dark ground (not the photo) closes. */}
      <div
        className="relative min-h-0 flex-1"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="pointer-events-none absolute inset-x-5 inset-y-0 sm:inset-x-20">
          {images.map((src, i) => (
            <Image
              key={src}
              src={src}
              alt={i === current ? t("imageAlt", { name, n: n(i + 1) }) : ""}
              fill
              sizes="100vw"
              priority={i === current}
              className={cn("object-contain transition-opacity duration-500 ease-out motion-reduce:transition-none", i === current ? "opacity-100" : "opacity-0")}
              aria-hidden={i !== current}
            />
          ))}
        </div>
        {total > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label={t("prevPhoto")} className={cn(navBtn, "absolute start-4 top-1/2 -translate-y-1/2 bg-ink/50 backdrop-blur-sm sm:start-6")}>
              <ArrowLeft className="h-5 w-5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label={t("nextPhoto")} className={cn(navBtn, "absolute end-4 top-1/2 -translate-y-1/2 bg-ink/50 backdrop-blur-sm sm:end-6")}>
              <ArrowRight className="h-5 w-5 rtl:rotate-180" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <p className="g-display px-5 py-5 text-center text-lg text-paper/80 sm:text-xl" aria-hidden="true">
        {name}
      </p>
    </div>,
    document.body
  );
}
