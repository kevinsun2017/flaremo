import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-150 outline-none select-none cursor-pointer active:scale-[0.98] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:translate-y-px",
        flame:
          "bg-brand-gradient text-white shadow-md hover:brightness-105 active:translate-y-px",
        secondary:
          "bg-surface text-ink shadow-[var(--panel-elev)] hover:bg-wash active:translate-y-px",
        outline:
          "border border-line bg-soft-surface text-ink hover:bg-wash-strong active:translate-y-px",
        ghost: "text-mist hover:bg-wash hover:text-ink",
        link: "text-signal underline-offset-4 hover:underline",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
      },
      size: {
        default: "h-10 px-5",
        xs: "h-7 gap-1 rounded-full px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-full px-4 text-xs sm:text-sm",
        lg: "h-12 rounded-full px-7 text-base font-semibold",
        icon: "size-10 rounded-full",
        "icon-sm": "size-8 rounded-full [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /**
     * Replaces the default `<button>` with a different element
     * (e.g. `render={<a href="…" />}`); children stay on Button.
     */
    render?: React.ReactElement;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: ButtonProps) {
  return useRender({
    render,
    defaultTagName: "button",
    props: {
      "data-slot": "button",
      "data-variant": variant,
      "data-size": size,
      className: cn(buttonVariants({ variant, size, className })),
      ...props,
    },
  });
}

export { Button, buttonVariants };
