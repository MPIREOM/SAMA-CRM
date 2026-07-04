"use client";

import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "gold" | "green" | "maroon" | "gray" | "red" | "outline";

const variants: Record<Variant, string> = {
  gold: "bg-gold-100 text-gold-800 border-gold-200",
  green: "bg-jabal-50 text-jabal-700 border-jabal-200",
  maroon: "bg-maroon-100 text-maroon-800 border-maroon-200",
  gray: "bg-maroon-50 text-maroon-500 border-maroon-100",
  red: "bg-crimson-50 text-crimson-700 border-crimson-200",
  outline: "bg-transparent text-maroon-600 border-maroon-200",
};

export function Badge({
  className,
  variant = "gray",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

/** Consistent market badge colors across the app. */
export function marketVariant(market: string | null): Variant {
  switch (market) {
    case "Oman":
      return "green";
    case "GCC":
      return "gold";
    case "International":
      return "maroon";
    default:
      return "gray";
  }
}
