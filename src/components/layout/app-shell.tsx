"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/database.types";

// Responsive shell for the staff app: fixed sidebar on large screens, a
// slide-in drawer behind a top bar below `lg` (front desk on a phone/tablet).
export function AppShell({
  role,
  fullName,
  children,
}: {
  role: Role;
  fullName: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { lang } = useLang();

  // Close the drawer whenever navigation happens.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes the drawer; lock body scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar role={role} fullName={fullName} />
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-maroon-950/60 transition-opacity",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 start-0 w-72 max-w-[85vw] transform shadow-2xl transition-transform duration-200",
            open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
          aria-label={COMMON.menu[lang]}
        >
          <Sidebar role={role} fullName={fullName} onNavigate={() => setOpen(false)} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute end-3 top-4 rounded-lg p-2 text-gold-100 hover:bg-maroon-700"
            aria-label={COMMON.close[lang]}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-maroon-100 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-maroon-800 hover:bg-maroon-50"
            aria-label={COMMON.menu[lang]}
            aria-expanded={open}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500 text-sm font-extrabold text-maroon-900">
            S
          </div>
          <p className="text-base font-extrabold text-maroon-900">{COMMON.appName[lang]}</p>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
