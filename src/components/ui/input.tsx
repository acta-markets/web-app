import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "neo-input w-full bg-off-white p-4 text-xl font-bold placeholder-gray-400",
        className
      )}
      {...props}
    />
  );
}


