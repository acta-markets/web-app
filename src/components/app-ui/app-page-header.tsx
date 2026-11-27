import { TYPE_LINK } from "@/components/app-ui/type-styles";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Chevron } from "./chevron";

/**
 * The title block every app page opens with. The type, the distance from the nav and the gap
 * to the content under it live here, so Trade, Earn and Portfolio cannot drift apart: a page
 * passes its words and nothing else.
 *
 * The content that follows starts right under the block; it adds no top margin of its own.
 */
export function AppPageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  /** The h1: plain words. */
  title: React.ReactNode;
  /** One quiet line under the title. */
  subtitle?: React.ReactNode;
  /** A link under the subtitle, usually an `AppPageHeaderLink`. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col items-center gap-3 px-6 pb-10 pt-16 max-md:px-3 max-md:pb-6 max-md:pt-8", className)}>
      <h1 className="w-full text-center font-space text-[64px] font-semibold leading-[1.2] tracking-[-1.28px] text-content-primary max-md:text-[40px]">
        {title}
      </h1>
      {subtitle || action ? (
        <div className="flex w-full max-w-[540px] flex-col items-center gap-1.5">
          {subtitle ? (
            <p className="w-full text-center font-mono text-base font-normal leading-[1.2] tracking-[-0.32px] text-content-secondary">{subtitle}</p>
          ) : null}
          {action}
        </div>
      ) : null}
    </header>
  );
}

/** The "how it works" link a page header carries, dressed as all clickable text: grey, regular, the forward chevron. */
export function AppPageHeaderLink({ href, prefetch, children }: { href: string; prefetch?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(TYPE_LINK, "text-base leading-[1.2]")}
    >
      {children}
      <Chevron kind="go" className="h-5 w-5" />
    </Link>
  );
}
