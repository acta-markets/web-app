import { AppPageHeader, AppPageHeaderLink } from "@/components/app-ui/app-page-header";
import { AppPill } from "@/components/app-ui/app-pill";
import { TYPE_LABEL, TYPE_NOTE } from "@/components/app-ui/type-styles";
import { LIMIT_SETTINGS } from "@/lib/agent/install";
import { EFFECT_LABEL, TOOL_LIST } from "@/lib/agent/tools";
import { cn } from "@/lib/cn";
import { ConnectAgent } from "./connect-agent";
import { VenueStatus } from "./venue-status";

/**
 * Agent: connecting an AI agent to Acta. The page is one widget (pick your agent, do one thing,
 * ask it something) and two short references under it: what the agent can lose and what it can
 * call. Every tool, command and limit comes from the modules the servers are built from, so the
 * page cannot describe a step or a tool that is not there.
 */

function Section({ id, title, lead, children }: { id: string; title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-[88px] pt-14 max-md:scroll-mt-[76px] max-md:pt-10">
      <h2 id={`${id}-title`} className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.03em] text-content-primary">
        {title}
      </h2>
      {lead ? <p className={cn(TYPE_NOTE, "mt-2 max-w-[620px] text-content-secondary")}>{lead}</p> : null}
      <div className="mt-6 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** The landing page's ruled grid: cells on a hairline ground. */
const GRID = "grid grid-cols-1 gap-px border border-bg-border bg-bg-border md:grid-cols-2";
const CELL = "flex flex-col gap-1.5 bg-bg-primary px-5 py-4";

export function AgentPage({ siteOrigin, apiOrigin, docsHref }: { siteOrigin: string; apiOrigin: string; docsHref: string }) {
  return (
    <>
      <AppPageHeader
        title="Agent"
        subtitle="Connect your AI agent. It reads the market and trades with its own wallet"
        action={<AppPageHeaderLink href={docsHref}>How it works</AppPageHeaderLink>}
      />
      <div className="mx-auto w-full max-w-[850px] pb-20 max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <p className={cn(TYPE_NOTE, "text-content-secondary")}>Devnet: test funds only. Nothing here is real money.</p>
          <VenueStatus apiOrigin={apiOrigin} />
        </div>

        <section id="connect" aria-label="Connect your agent" className="scroll-mt-[88px] max-md:scroll-mt-[76px]">
          <ConnectAgent siteOrigin={siteOrigin} />
        </section>

        <Section
          id="risk"
          title="What it can lose"
          lead="An agent that trades can lose what its wallet holds, up to the limits you set. Every trade it places is final."
        >
          <ul className={cn(TYPE_NOTE, "flex max-w-[620px] list-none flex-col gap-2 text-content-primary")}>
            <li>A sold option that ends on the wrong side converts the deposit at the strike. The premium is kept.</li>
            <li>A bought option that ends on the wrong side expires. The premium is gone.</li>
            <li>An agent can misread a market or act on a bad instruction. The limits below are what stop it, so set them.</li>
          </ul>
          <dl className={GRID}>
            {LIMIT_SETTINGS.map((setting) => (
              <div key={setting.name} className={CELL}>
                <dt className={cn(TYPE_LABEL, "break-all text-content-primary")}>{setting.name}</dt>
                <dd className={cn(TYPE_NOTE, "text-content-secondary")}>
                  {setting.meaning}. Default: {setting.fallback}
                </dd>
              </div>
            ))}
          </dl>
          <p className={cn(TYPE_NOTE, "max-w-[620px] text-content-secondary")}>
            Limits are environment variables of the server, set where your agent keeps its MCP servers. No tool can raise them and a restart does not
            reset them. An agent that can edit its own settings can change them, so the wallet should hold only what you accept losing. No tool
            sends funds to an address.
          </p>
        </Section>

        <Section id="tools" title="What it can do" lead="A tool that moves funds asks for a limit price and fills only at that or better.">
          <ul className={cn(GRID, "list-none")}>
            {TOOL_LIST.map((tool) => (
              <li key={tool.name} className={cn(CELL, "md:last:odd:col-span-2")}>
                <div className="flex flex-wrap items-center gap-2">
                  <code className={cn(TYPE_LABEL, "text-content-primary")}>{tool.name}</code>
                  <AppPill active={tool.effect === "funds"}>{EFFECT_LABEL[tool.effect]}</AppPill>
                </div>
                <p className={cn(TYPE_NOTE, "text-content-secondary")}>{tool.summary}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
