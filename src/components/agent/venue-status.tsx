"use client";

import { useEffect, useState } from "react";
import { TYPE_NOTE } from "@/components/app-ui/type-styles";
import { cn } from "@/lib/cn";

type Health = "checking" | "up" | "down";

/** Whether the venue an agent would reach is answering right now: one read of its health when the page opens. */
export function VenueStatus({ apiOrigin }: { apiOrigin: string }) {
  const [health, setHealth] = useState<Health>("checking");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiOrigin}/health`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => (response.ok ? ((await response.json()) as { verdict?: string }).verdict === "pass" : false))
      .then((ok) => setHealth(ok ? "up" : "down"))
      .catch(() => {
        if (!controller.signal.aborted) setHealth("down");
      });
    return () => controller.abort();
  }, [apiOrigin]);

  const text = health === "up" ? "The venue is up" : health === "down" ? "The venue is not answering" : "Checking the venue";
  return (
    <p className={cn(TYPE_NOTE, "flex items-center gap-2 text-content-secondary")} role="status">
      <span
        aria-hidden
        className={cn("inline-block h-2 w-2", health === "up" ? "bg-accent-primary" : health === "down" ? "bg-[#FF8A3C]" : "bg-content-tertiary")}
      />
      {text}
    </p>
  );
}
