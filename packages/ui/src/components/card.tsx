import * as React from "react";
import { cn } from "../cn";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: DivProps) {
  return <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />;
}
export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn("grid gap-1.5 p-5 pb-0 sm:p-6 sm:pb-0", className)} {...props} />;
}
/** Defaults to h1 (single-card pages); pass `as` for cards inside a page that has its own h1. */
export function CardTitle({ className, as: Tag = "h1", ...props }: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3" }) {
  return <Tag className={cn("text-xl font-semibold tracking-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: DivProps) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}
