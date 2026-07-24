import Link from "next/link";
import { ActaLogo } from "@/components/acta-logo";
import { LandingButton } from "./landing-primitives";

const NAV = [
  { label: "Docs", href: "/docs", external: false },
  { label: "Markets", href: "/earn", external: false },
] as const;

export function LandingHeader() {
  return (
    // ::before covers the gap iOS Safari opens above sticky elements while its toolbar collapses
    <header className="sticky top-0 z-20 border-b border-bg-border backdrop-blur-md before:absolute before:inset-x-0 before:bottom-full before:h-24 before:bg-[rgba(18,18,18,0.72)] before:backdrop-blur-md before:content-['']" style={{ background: "rgba(18,18,18,0.72)" }}>
      <div className="mx-auto flex w-full max-w-[850px] items-center justify-between gap-6 py-5 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:py-4">
        <Link href="/" aria-label="Acta home">
          <ActaLogo className="h-7" />
        </Link>
        <nav className="flex items-center gap-6 max-md:hidden">
          {NAV.map((item) =>
            item.external ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[13px] tracking-[-0.02em] text-content-secondary transition-colors hover:text-content-primary"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className="font-mono text-[13px] tracking-[-0.02em] text-content-secondary transition-colors hover:text-content-primary"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <LandingButton variant="primary" size="sm" href="/earn">
          Launch app ↗
        </LandingButton>
      </div>
    </header>
  );
}
