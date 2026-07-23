import type { Metadata } from "next";
import { Footer } from "@/components/sections/footer";
import { LandingHeader } from "@/components/landing/landing-header";

const DOCS_REPOSITORY = "https://github.com/acta-markets/public-docs";

const sections = [
  {
    title: "Understand the protocol",
    description: "Actors, RFQ mechanics, settlement paths, fees, economics, and risk.",
    links: [
      { label: "Protocol flow", href: `${DOCS_REPOSITORY}/blob/main/reference/protocol-flow.md` },
      { label: "Governance and security", href: `${DOCS_REPOSITORY}/blob/main/reference/governance.md` },
      { label: "Capacity limits", href: `${DOCS_REPOSITORY}/blob/main/reference/caps.md` },
    ],
  },
  {
    title: "Integrate as a taker",
    description: "Authenticate a Solana wallet, discover markets, request quotes, and sign sponsored transactions.",
    links: [
      { label: "Taker quickstart", href: `${DOCS_REPOSITORY}/blob/main/quickstart/taker-quickstart.md` },
      { label: "TypeScript SDK", href: `${DOCS_REPOSITORY}/blob/main/quickstart/web-client-ts-sdk.md` },
      { label: "Taker API reference", href: `${DOCS_REPOSITORY}/blob/main/reference/taker-api.md` },
    ],
  },
  {
    title: "Integrate as a maker",
    description: "Register signing keys, subscribe to RFQs, quote safely, and recover after reconnects.",
    links: [
      { label: "Maker quickstart", href: `${DOCS_REPOSITORY}/blob/main/quickstart/maker-quickstart.md` },
      { label: "Rust maker SDK", href: `${DOCS_REPOSITORY}/blob/main/quickstart/maker-rust-sdk.md` },
      { label: "Maker API reference", href: `${DOCS_REPOSITORY}/blob/main/reference/maker-api.md` },
    ],
  },
  {
    title: "Use public discovery",
    description: "Read-only endpoints and machine-readable descriptions for tooling and agents.",
    links: [
      { label: "HTTP API reference", href: `${DOCS_REPOSITORY}/blob/main/reference/http-api.md` },
      { label: "OpenAPI", href: "/openapi.json", internal: true },
      { label: "API catalog", href: "/.well-known/api-catalog", internal: true },
    ],
  },
] as const;

export const metadata: Metadata = {
  title: "Documentation",
  description: "Acta protocol quickstarts, API references, security model, and machine-readable discovery resources.",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      <LandingHeader />
      <main>
        <section className="border-b border-bg-border bg-black">
          <div className="mx-auto w-full max-w-[850px] px-6 py-24 max-md:px-3 max-md:py-16">
            <div
              className="mb-5 font-mono text-[11px] uppercase text-accent-secondary"
              style={{ letterSpacing: "0.14em" }}
            >
              {"// Documentation"}
            </div>
            <h1
              className="max-w-[760px] font-space font-semibold"
              style={{ fontSize: "clamp(52px, 9vw, 96px)", lineHeight: 0.95, letterSpacing: "-0.04em" }}
            >
              Build with Acta.
            </h1>
            <p className="mt-8 max-w-[680px] text-base leading-7 text-content-secondary">
              Start with the workflow that matches your role. The public documentation repository is the
              source of truth; this page is the stable entrypoint for people and agents.
            </p>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-[850px] grid-cols-2 border-x border-bg-border max-md:grid-cols-1">
          {sections.map((section) => (
            <article
              key={section.title}
              className="border-b border-bg-border p-8 even:border-l max-md:p-6 max-md:even:border-l-0"
            >
              <h2 className="font-space text-3xl font-semibold tracking-[-0.03em]">{section.title}</h2>
              <p className="mt-4 min-h-[72px] text-sm leading-6 text-content-secondary max-md:min-h-0">
                {section.description}
              </p>
              <ul className="mt-7 space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={"internal" in link && link.internal ? undefined : "_blank"}
                      rel={"internal" in link && link.internal ? undefined : "noreferrer noopener"}
                      className="inline-flex items-center gap-2 text-sm font-medium text-accent-secondary transition-colors hover:text-accent-primary"
                    >
                      {link.label}
                      <span aria-hidden>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="mx-auto w-full max-w-[850px] border-x border-bg-border px-8 py-16 max-md:px-6">
          <h2 className="font-space text-4xl font-semibold tracking-[-0.03em]">Environment endpoints</h2>
          <div className="mt-8 overflow-x-auto border border-bg-border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-bg-border text-content-secondary">
                <tr>
                  <th className="px-5 py-4 font-medium">Environment</th>
                  <th className="px-5 py-4 font-medium">Website</th>
                  <th className="px-5 py-4 font-medium">Public API</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-bg-border">
                  <td className="px-5 py-4">Devnet</td>
                  <td className="px-5 py-4"><a className="text-accent-secondary" href="https://devnet.acta.markets">devnet.acta.markets</a></td>
                  <td className="px-5 py-4"><a className="text-accent-secondary" href="https://devnet-api.acta.markets/health">devnet-api.acta.markets</a></td>
                </tr>
                <tr>
                  <td className="px-5 py-4">Beta / Mainnet</td>
                  <td className="px-5 py-4"><a className="text-accent-secondary" href="https://beta.acta.markets">beta.acta.markets</a></td>
                  <td className="px-5 py-4"><a className="text-accent-secondary" href="https://beta-api.acta.markets/health">beta-api.acta.markets</a></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
