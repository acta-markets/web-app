"use client";

import { useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppTextTabs } from "@/components/app-ui/app-text-tabs";

export type VaultDetailTab = { value: string; label: string; content: React.ReactNode; aside?: React.ReactNode };

/** Lower half of the vault page, one section at a time. */
export function VaultDetailTabs({ tabs }: { tabs: VaultDetailTab[] }) {
  // null until a click: Positions arrives after the first render and must still open first
  const [selected, setSelected] = useState<string | null>(null);
  const active = tabs.find((tab) => tab.value === selected) ?? tabs[0];
  return (
    <AppCard className="min-w-0">
      {/* phones: the aside takes its own line above the tabs, and the tabs spread over the full width, so all five fit down to 360px and none scrolls sideways */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-bg-border px-5 max-md:px-4">
        <AppTextTabs
          ariaLabel="Vault details"
          className="-mb-px min-w-0 max-md:w-full max-md:justify-between max-md:gap-2"
          value={active?.value ?? ""}
          onChange={setSelected}
          options={tabs.map(({ value, label }) => ({ value, label }))}
        />
        {active?.aside ? <div className="shrink-0 max-md:order-first max-md:w-full max-md:pt-3">{active.aside}</div> : null}
      </div>
      <div className="p-5 max-md:p-4">{active?.content}</div>
    </AppCard>
  );
}
