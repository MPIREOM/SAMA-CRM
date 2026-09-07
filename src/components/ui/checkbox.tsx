"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Labelled checkbox that matches the maroon/gold form controls. */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: string }
>(({ className, label, ...props }, ref) => (
  <label
    className={cn(
      "inline-flex cursor-pointer select-none items-center gap-2 text-sm text-maroon-800",
      props.disabled && "cursor-not-allowed opacity-60",
      className
    )}
  >
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 rounded border-maroon-300 text-maroon-800 accent-maroon-800 focus:ring-2 focus:ring-gold-200"
      {...props}
    />
    {label && <span>{label}</span>}
  </label>
));
Checkbox.displayName = "Checkbox";
