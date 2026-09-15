"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Mobile-only bar pinned to the bottom of the home and room pages. It slides
// away while the availability form itself is on screen so the page never
// shows two search buttons.

export function StickyCta({ targetId = "availability", label }: { targetId?: string; label?: string }) {
  const t = useTranslations("home");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0 });
    io.observe(target);
    return () => io.disconnect();
  }, [targetId]);

  function scrollToWidget() {
    const target = document.getElementById(targetId);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    const first = target?.querySelector<HTMLInputElement>("input");
    window.setTimeout(() => first?.focus({ preventScroll: true }), 500);
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-500 ease-out md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-paper via-paper/90 to-transparent" aria-hidden="true" />
      <button type="button" onClick={scrollToWidget} tabIndex={visible ? 0 : -1} className="g-btn-primary relative w-full shadow-float">
        {label ?? t("stickyCta")}
      </button>
    </div>
  );
}
