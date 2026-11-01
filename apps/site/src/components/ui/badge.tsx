import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border border-signal/30 bg-signal/10 text-signal-ink",
        flame:
          "border border-flame-400/40 bg-flame-50 text-flame-700 dark:bg-flame-900/30 dark:text-flame-300",
        secondary: "bg-soft-surface text-ink border border-line/60",
        outline: "border border-line bg-transparent text-mist hover:text-ink",
        ghost: "text-mist hover:bg-wash",
        success:
          "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /**
     * Replaces the default `<span>` with a different element.
     */
    render?: React.ReactElement;
  };

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: BadgeProps) {
  return useRender({
    render,
    defaultTagName: "span",
    props: {
      "data-slot": "badge",
      "data-variant": variant,
      className: cn(badgeVariants({ variant }), className),
      ...props,
    },
  });
}

export { Badge, badgeVariants };
