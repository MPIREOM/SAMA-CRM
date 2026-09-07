"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Side panel anchored to the inline-end edge (right in LTR, left in RTL). */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-maroon-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 ms-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl",
          className
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-maroon-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="truncate text-lg font-bold text-maroon-900">{title}</h2>}
            {subtitle && <p className="truncate text-xs text-maroon-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-maroon-400 hover:bg-maroon-50 hover:text-maroon-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">{children}</div>
        {footer && <div className="border-t border-maroon-100 px-5 py-3">{footer}</div>}
      </aside>
    </div>
  );
}
