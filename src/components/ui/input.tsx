import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "neo-input w-full bg-bg-tertiary p-4 text-xl font-bold text-content-primary placeholder-content-tertiary",
        className
      )}
      {...props}
    />
  );
}
