import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = React.forwardRef(
  ({ className, children, ...props }, ref) => (
    <CollapsiblePrimitive.CollapsibleTrigger
      ref={ref}
      className={cn(
        "flex w-full items-center justify-between gap-3 p-4 cursor-pointer select-none",
        "bg-gradient-to-br from-[#eef4ff] to-[#e9f1ff] dark:from-[#152243] dark:to-[#192a52]",
        "border-b border-brand-300/45 dark:border-[#1a2244]",
        "[&[data-state=open]>svg]:rotate-90",
        className
      )}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.CollapsibleTrigger>
  )
);
CollapsibleTrigger.displayName =
  CollapsiblePrimitive.CollapsibleTrigger.displayName;

const CollapsibleContent = React.forwardRef(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleContent
    ref={ref}
    className={cn(
      "overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
      className
    )}
    {...props}
  />
));
CollapsibleContent.displayName =
  CollapsiblePrimitive.CollapsibleContent.displayName;

const CollapsibleChevron = React.forwardRef(({ className, ...props }, ref) => (
  <ChevronRight
    ref={ref}
    className={cn(
      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
      className
    )}
    {...props}
  />
));
CollapsibleChevron.displayName = "CollapsibleChevron";

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
};
