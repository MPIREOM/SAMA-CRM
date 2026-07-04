"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-maroon-800 text-gold-100 hover:bg-maroon-700 focus-visible:ring-maroon-400",
  secondary:
    "bg-crimson-700 text-white hover:bg-crimson-600 focus-visible:ring-crimson-300",
  gold: "bg-gold-500 text-maroon-900 hover:bg-gold-400 focus-visible:ring-gold-300",
  outline:
    "border border-maroon-200 bg-white text-maroon-800 hover:bg-maroon-50 focus-visible:ring-maroon-300",
  ghost: "text-maroon-700 hover:bg-maroon-100 focus-visible:ring-maroon-300",
  danger: "bg-crimson-700 text-white hover:bg-crimson-600 focus-visible:ring-crimson-300",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
