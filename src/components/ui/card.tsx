import * as React from "react";
import { cn } from "@/lib/cn";

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  hoverNeo?: boolean;
};

export function Card({ className, hoverNeo = true, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "border-[3px] border-bg-border bg-bg-tertiary transition-all duration-200 ease-in-out",
        hoverNeo &&
          "hover:-translate-x-1 hover:-translate-y-1 hover:shadow-neo-hover",
        className
      )}
      {...props}
    />
  );
}
