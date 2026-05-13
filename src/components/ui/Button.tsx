import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed",
          {
            "bg-blue-600 hover:bg-blue-500 text-white focus:ring-blue-500": variant === "primary",
            "bg-neutral-700 hover:bg-neutral-600 text-neutral-100 focus:ring-neutral-500": variant === "secondary",
            "bg-red-700 hover:bg-red-600 text-white focus:ring-red-500": variant === "danger",
            "bg-transparent hover:bg-neutral-800 text-neutral-300 focus:ring-neutral-500": variant === "ghost",
          },
          {
            "px-2.5 py-1 text-xs": size === "sm",
            "px-4 py-2 text-sm": size === "md",
            "px-6 py-3 text-base": size === "lg",
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
