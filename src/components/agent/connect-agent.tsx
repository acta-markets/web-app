"use client";

import { useMemo, useRef, useState } from "react";
import { AppButtonAnchor } from "@/components/app-ui/app-button";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { TYPE_DENSE, TYPE_LABEL, TYPE_NOTE } from "@/components/app-ui/type-styles";
import { agentProviders, EXAMPLE_PROMPTS, READ_PROMPTS, type ConnectMode } from "@/lib/agent/install";
import { cn } from "@/lib/cn";
import { CopyBlock } from "./copy-block";

/**
 * Connecting an agent: pick who makes it, do one thing, ask it something. The page is this
 * widget. Ten buttons, nine makers and everything else; a maker with several tools shows
 * them as a row to pick from. Every tool has the same two steps, so a person reads only theirs.
 */

const MODE_LINE: Record<ConnectMode, string> = {
  trade: "Runs on your machine with a wallet it makes there. It reads and trades.",
  read: "The site's own server. No wallet and no sign in, and it cannot trade.",
};

/** A maker's mark, drawn in the text colour whatever colours the file has. */
function Mark({ icon }: { icon: string }) {
  const image = `url(/images/agent-tools/${icon})`;
  return (
    <span
      aria-hidden
      className="size-7 shrink-0 bg-current"
      style={{ maskImage: image, WebkitMaskImage: image, maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center" }}
    />
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className={cn(TYPE_LABEL, "flex gap-3 text-content-primary")}>
        <span className="text-content-tertiary">{String(n).padStart(2, "0")}</span>
        <span>{title}</span>
      </p>
      {children}
    </div>
  );
}

export function ConnectAgent({ siteOrigin }: { siteOrigin: string }) {
  const providers = useMemo(() => agentProviders(siteOrigin), [siteOrigin]);
  const [providerId, setProviderId] = useState(providers[0].id);
  // The tool last picked under each maker, so going back to a maker finds it as it was left.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [wanted, setWanted] = useState<ConnectMode>("trade");
  const steps = useRef<HTMLDivElement>(null);

  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const tool = provider.apps.find((app) => app.id === picked[provider.id]) ?? provider.apps[0];
  // A tool that cannot run a server on the machine reads only, whatever was picked before.
  const mode: ConnectMode = tool[wanted] ? wanted : tool.trade ? "trade" : "read";
  const setup = tool[mode];

  // On a phone the buttons can fill the screen: after a pick, bring the steps up to it.
  const pick = (next: string) => {
    setProviderId(next);
    const panel = steps.current;
    if (panel && panel.getBoundingClientRect().top > window.innerHeight * 0.6) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="border border-bg-border bg-bg-primary">
      <div role="radiogroup" aria-label="Who makes your agent" className="-mb-px -mr-px grid grid-cols-2 overflow-hidden md:grid-cols-5">
        {providers.map((p) => {
          const active = p.id === provider.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(p.id)}
              className={cn(
                TYPE_LABEL,
                "flex min-w-0 flex-col items-start gap-4 border-b border-r border-bg-border px-5 py-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/40 max-md:px-4 max-md:py-4",
                active
                  ? "bg-accent-primary/20 text-content-primary shadow-[inset_0_2px_0_var(--accent-primary)]"
                  : "text-content-secondary hover:bg-action-primary hover:text-content-primary",
              )}
            >
              <Mark icon={p.icon} />
              <span className="min-w-0 break-words leading-[1.2]">{p.name}</span>
            </button>
          );
        })}
      </div>

      <div ref={steps} className="flex scroll-mt-[88px] flex-col gap-6 border-t border-bg-border p-6 max-md:scroll-mt-[76px] max-md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h3 className="font-space text-xl font-semibold leading-[1.2] tracking-[-0.03em] text-content-primary">Connect {tool.name}</h3>
          <AppSegmented
            ariaLabel="What it can do"
            value={mode}
            onChange={setWanted}
            stretch={false}
            options={[
              { value: "trade", label: "Trade", disabled: !tool.trade },
              { value: "read", label: "Read only", disabled: !tool.read },
            ]}
          />
        </div>

        {provider.apps.length > 1 ? (
          <div role="radiogroup" aria-label={`Which ${provider.name} tool`} className="-mt-2 flex flex-wrap gap-2">
            {provider.apps.map((app) => {
              const active = app.id === tool.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPicked((before) => ({ ...before, [provider.id]: app.id }))}
                  className={cn(
                    TYPE_DENSE,
                    "border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40",
                    active
                      ? "border-accent-primary/40 bg-accent-primary/20 text-content-primary"
                      : "border-bg-border text-content-secondary hover:border-content-primary/25 hover:text-content-primary",
                  )}
                >
                  {app.name}
                </button>
              );
            })}
          </div>
        ) : null}

        <p className={cn(TYPE_NOTE, "-mt-2 max-w-[620px] text-content-secondary")}>
          {MODE_LINE[mode]}
          {tool.trade ? null : " This app cannot run a server on your machine, so pick another tool to trade."}
        </p>

        {setup ? (
          <Step n={1} title={setup.title}>
            {setup.link ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <AppButtonAnchor href={setup.link.href} className="pl-5 pr-5">
                  {setup.link.label}
                </AppButtonAnchor>
                {setup.block ? <span className={cn(TYPE_DENSE, "text-content-secondary")}>or by hand:</span> : null}
              </div>
            ) : null}
            {setup.block ? (
              <CopyBlock label={setup.block.label} text={setup.block.text} wrap={setup.block.wrap} action={setup.block.wrap ? "Copy prompt" : undefined} />
            ) : null}
            {setup.note ? <p className={cn(TYPE_NOTE, "max-w-[620px] text-content-secondary")}>{setup.note}</p> : null}
          </Step>
        ) : null}

        <Step n={2} title={mode === "trade" ? "Ask it. The first answer shows the wallet it made" : "Ask it"}>
          <ul className="flex list-none flex-col gap-2">
            {(mode === "trade" ? EXAMPLE_PROMPTS : READ_PROMPTS).map((prompt, i) => (
              <li key={prompt}>
                <CopyBlock label={`ask ${i + 1}`} text={prompt} compact />
              </li>
            ))}
          </ul>
        </Step>
      </div>
    </div>
  );
}
