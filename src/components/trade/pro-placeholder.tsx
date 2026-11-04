import * as React from "react";
import { AppButton } from "@/components/app-ui/app-button";
import { AppCard } from "@/components/app-ui/app-card";

export function ProPlaceholder({
  modeSwitch,
  howItWorks,
  onEasy,
}: {
  modeSwitch: React.ReactNode;
  howItWorks: React.ReactNode;
  onEasy: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[850px] pb-20 pt-12 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-6">
      <div className="flex flex-wrap items-center gap-3">
        {modeSwitch}
        <div className="ml-auto">{howItWorks}</div>
      </div>
      <AppCard className="mt-8 flex flex-col items-start gap-4 p-8 max-md:mt-6 max-md:p-5">
        <h2 className="font-space text-[40px] font-semibold leading-[1.2] tracking-[-0.8px] text-content-primary max-md:text-2xl">
          Make Profit is coming soon
        </h2>
        <p className="font-mono text-base leading-[1.4] text-content-secondary">
          Make Yield trades the same markets.
        </p>
        <AppButton onClick={onEasy}>Switch to Make Yield</AppButton>
      </AppCard>
    </div>
  );
}
