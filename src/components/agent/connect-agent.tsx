"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppButtonAnchor } from "@/components/app-ui/app-button";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { Chevron } from "@/components/app-ui/chevron";
import { TYPE_DENSE, TYPE_LABEL, TYPE_NOTE } from "@/components/app-ui/type-styles";
import { agentProviders, EXAMPLE_PROMPTS, READ_PROMPTS, type ConnectMode, type ToolSetup } from "@/lib/agent/install";
import { cn } from "@/lib/cn";
import { CopyBlock } from "./copy-block";

/**
 * Connecting an agent: pick who makes it, do one thing, ask it something. The page is this
 * widget. Ten buttons, nine makers and everything else; a maker with several tools shows
 * them as a row to pick from. Every tool has the same two steps, so a person reads only theirs.
 *
 * The step has one thing to press: the tool's own install link where it has one (the entry to
 * paste by hand is folded under it), otherwise a button that copies the command or the entry.
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

type Block = NonNullable<ToolSetup["block"]>;

/** What the button that copies a block says: the thing being copied. */
function copyWord(block: Block): string {
  if (block.wrap) return "Copy prompt";
  if (block.label === "Terminal") return "Copy command";
  return /^https?:\/\/\S+$/.test(block.text) ? "Copy address" : "Copy snippet";
}

/** A command reads as one line and wraps on a narrow screen; an entry keeps its own lines. */
const wraps = (block: Block) => block.wrap || block.label === "Terminal";

/** The choice in the address, so a link to the page opens on a tool: `?tool=hermes&mode=read`. */
function readAddress(): { tool: string | null; mode: ConnectMode | null } {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  return { tool: params.get("tool"), mode: mode === "read" || mode === "trade" ? mode : null };
}

export function ConnectAgent({ siteOrigin }: { siteOrigin: string }) {
  const providers = useMemo(() => agentProviders(siteOrigin), [siteOrigin]);
  const [providerId, setProviderId] = useState(providers[0].id);
  // The tool last picked under each maker, so going back to a maker finds it as it was left.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [wanted, setWanted] = useState<ConnectMode>("trade");
  const steps = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const tool = provider.apps.find((app) => app.id === picked[provider.id]) ?? provider.apps[0];
  // A tool that cannot run a server on the machine reads only, whatever was picked before.
  const mode: ConnectMode = tool[wanted] ? wanted : tool.trade ? "trade" : "read";
  const setup = tool[mode];

  // A link to the page may name a tool. Read once, after the first paint, so the server's page and
  // the browser's first one agree.
  useEffect(() => {
    const { tool: named, mode: namedMode } = readAddress();
    const owner = named ? providers.find((p) => p.apps.some((app) => app.id === named)) : undefined;
    if (owner && named) {
      setProviderId(owner.id);
      setPicked((before) => ({ ...before, [owner.id]: named }));
    }
    if (namedMode) setWanted(namedMode);
    restored.current = true;
  }, [providers]);

  // And written back as the choice changes. replaceState, not the router: the page is not asked for again.
  useEffect(() => {
    if (!restored.current || window.location.pathname !== "/agent") return;
    const first = providers[0].apps[0].id;
    const params = new URLSearchParams(window.location.search);
    if (tool.id === first) params.delete("tool");
    else params.set("tool", tool.id);
    if (mode === "read" && tool.trade) params.set("mode", "read");
    else params.delete("mode");
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, "", next);
  }, [providers, tool.id, tool.trade, mode]);

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
                "flex min-w-0 flex-col items-start gap-4 border-b border-r border-bg-border px-5 py-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/40 max-md:flex-row max-md:items-center max-md:gap-3 max-md:px-4 max-md:py-3.5",
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
          <h3 className="font-space text-xl font-semibold leading-[1.2] tracking-[-0.03em] text-content-primary">
            Connect {tool.id === "other" ? "any agent" : tool.name}
          </h3>
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
              <>
                <div>
                  <AppButtonAnchor href={setup.link.href} className="pl-5 pr-5 max-md:w-full">
                    {setup.link.label}
                  </AppButtonAnchor>
                </div>
                {setup.block ? (
                  // Folded away: the button above does this. Keyed by the tool, so it is shut again on the next one.
                  <details key={`${tool.id}:${mode}`} className="group">
                    <summary
                      className={cn(
                        TYPE_NOTE,
                        "inline-flex cursor-pointer list-none items-center gap-1.5 text-content-secondary transition-colors hover:text-content-primary focus-visible:text-content-primary focus-visible:outline-none [&::-webkit-details-marker]:hidden",
                      )}
                    >
                      Or add it by hand
                      <Chevron kind="unfold" className="h-4 w-4 group-open:hidden" />
                      <Chevron kind="fold" className="hidden h-4 w-4 group-open:block" />
                    </summary>
                    <CopyBlock className="mt-3" label={setup.block.label} text={setup.block.text} wrap={wraps(setup.block)} />
                  </details>
                ) : null}
              </>
            ) : setup.block ? (
              <CopyBlock label={setup.block.label} text={setup.block.text} wrap={wraps(setup.block)} action={copyWord(setup.block)} />
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
