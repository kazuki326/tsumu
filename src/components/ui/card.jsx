import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[20px] bg-card text-card-foreground shadow-[0_10px_30px_rgba(0,0,0,0.07)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

// Card with top gradient bar (replaces .cap)
const CardCap = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative rounded-[20px] bg-card text-card-foreground shadow-[0_10px_30px_rgba(0,0,0,0.07)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden border border-brand-200/55 dark:border-[#1a2244]",
      "before:absolute before:inset-x-0 before:top-0 before:h-2 before:bg-gradient-to-r before:from-brand-600 before:to-violet-500/70",
      className
    )}
    {...props}
  />
));
CardCap.displayName = "CardCap";

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-gradient-to-br from-[#eef4ff] to-[#e9f1ff] dark:from-[#152243] dark:to-[#192a52] border-b border-brand-300/45 dark:border-[#1a2244] p-4 md:px-6",
      className
    )}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-base font-extrabold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground mt-1", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 md:px-6", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-4 md:px-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardCap,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
