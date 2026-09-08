"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck } from "lucide-react";

// Mobile-only sticky "Check availability" bar on the home page. Hidden while
// the widget itself is on screen so the page never shows two search buttons.

export function StickyCta({ targetId = "availability", label }: { targetId?: string; label?: string }) {
  const t = useTranslations("home");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0.2 });
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
      className={`fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-50 via-stone-50/90 to-transparent" />
      <button
        type="button"
        onClick={scrollToWidget}
        tabIndex={visible ? 0 : -1}
        className="g-btn-primary relative w-full shadow-[0_10px_30px_-10px_rgba(59,23,27,0.6)]"
      >
        <CalendarCheck className="h-5 w-5" aria-hidden="true" />
        {label ?? t("stickyCta")}
      </button>
    </div>
  );
}
