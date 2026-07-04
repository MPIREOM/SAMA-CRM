"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-maroon-200 bg-white px-3 text-sm text-maroon-900",
        "placeholder:text-maroon-300",
        "focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200",
        "disabled:cursor-not-allowed disabled:bg-maroon-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
