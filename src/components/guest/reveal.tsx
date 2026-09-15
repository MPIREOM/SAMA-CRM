"use client";

import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Reveal-on-scroll. Renders its children with the .g-reveal class and adds
// .is-in the first time the element enters the viewport. The CSS handles the
// motion (globals.css), so this stays tiny; reduced-motion users and
// no-JavaScript visitors see the content immediately.

export function Reveal({
  as: Tag = "div",
  children,
  className,
  delay = 0,
  once = true,
  style,
  ...rest
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  /** Milliseconds, for staggering siblings. */
  delay?: number;
  once?: boolean;
  style?: CSSProperties;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in");
      return;
    }
    // Already on screen at mount (above the fold): show without waiting a frame.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9 && rect.bottom > 0) {
      el.classList.add("is-in");
      if (once) return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("is-in");
            if (once) io.disconnect();
          } else if (!once) {
            el.classList.remove("is-in");
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return (
    <Tag ref={ref} className={cn("g-reveal", className)} style={{ ...style, "--g-delay": `${delay}ms` } as CSSProperties} {...rest}>
      {children}
    </Tag>
  );
}
