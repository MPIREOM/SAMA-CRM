"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-lg border border-maroon-200 bg-white px-3 py-2 text-sm text-maroon-900",
      "placeholder:text-maroon-300",
      "focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200",
      "disabled:cursor-not-allowed disabled:bg-maroon-50",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
