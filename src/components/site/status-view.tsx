"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { ActaLogo } from "@/components/acta-logo";
import { AppButton, AppButtonLink } from "@/components/app-ui/app-button";
import { AppPageHeader } from "@/components/app-ui/app-page-header";
import { Chevron } from "@/components/app-ui/chevron";
import { TYPE_DENSE } from "@/components/app-ui/type-styles";
import { Footer } from "@/components/sections/footer";

/**
 * The two pages nobody asks for: an address that leads nowhere, and a page that broke. Each
 * says what happened in the app's own words and offers the way back, in the same title block
 * every app page opens with.
 */

const ACTIONS = "flex flex-wrap items-center justify-center gap-3 px-6 pb-24 max-md:px-3 max-md:pb-16";

/** An address that leads nowhere. */
export function NotFoundView() {
  return (
    <section>
      <AppPageHeader title="Page not found" subtitle="This address does not lead anywhere. It may be mistyped, or the page may have moved." />
      <div className={ACTIONS}>
        <AppButtonLink href="/trade">
          Trade
          <Chevron kind="go" className="h-5 w-5" />
        </AppButtonLink>
        <AppButtonLink href="/earn" variant="secondary">
          Earn
        </AppButtonLink>
      </div>
    </section>
  );
}

/**
 * A page that broke while it was being shown. A display error says nothing about a trade
 * that was already signed, so the page says where to look before anything is tried twice.
 * `digest` is the server's reference for the error, shown so it can be quoted in a report.
 */
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section>
      <AppPageHeader
        title="Something went wrong"
        subtitle="This page could not be shown. If you had just signed a trade, check Portfolio before trying again."
        action={error.digest ? <p className={`${TYPE_DENSE} text-content-tertiary`}>Reference {error.digest}</p> : undefined}
      />
      <div className={ACTIONS}>
        <AppButton onClick={reset}>Try again</AppButton>
        <AppButtonLink href="/portfolio" variant="secondary">
          Portfolio
        </AppButtonLink>
      </div>
    </section>
  );
}

/**
 * The page around one of these views where the app's own header is not available: outside
 * the app's routes there is no wallet to show, so the logo and the footer are enough.
 */
export function StatusFrame({ children }: { children: ReactNode }) {
  return (
    <div className="app-type flex min-h-screen flex-col bg-bg-primary text-content-primary">
      <header className="mx-auto w-full max-w-page px-6 py-5 max-md:px-3 max-md:py-4">
        <Link href="/" aria-label="Acta home">
          <ActaLogo className="h-7" />
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
