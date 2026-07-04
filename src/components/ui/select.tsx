"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 w-full rounded-lg border border-maroon-200 bg-white px-3 text-sm text-maroon-900",
      "focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200",
      "disabled:cursor-not-allowed disabled:bg-maroon-50",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
