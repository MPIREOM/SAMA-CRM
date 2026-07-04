"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-maroon-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto scrollbar-thin rounded-xl bg-white shadow-xl",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-maroon-100 px-5 py-4">
          <h2 className="text-lg font-bold text-maroon-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-maroon-400 hover:bg-maroon-50 hover:text-maroon-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
