import Link from "next/link";
import { ActaLogo } from "@/components/acta-logo";

const links = [
  { label: "Docs", href: "/docs", external: false },
  { label: "GitHub", href: "https://github.com/acta-markets/public-docs", external: true },
  { label: "Telegram", href: "https://t.me/+J3_R6jW-msc1MDU6", external: true },
];

export function Footer() {
  return (
    <footer className="border-t border-bg-border">
      <div className="mx-auto flex h-[76px] w-full max-w-[850px] items-center justify-between py-6 max-xl:px-[71px] max-lg:px-6 max-md:h-auto max-md:flex-col max-md:gap-3 max-md:px-3 max-md:py-6">
        <Link href="/earn">
          <ActaLogo className="h-7" />
        </Link>

        <nav className="flex flex-wrap items-center justify-center gap-4">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={"external" in link && link.external ? "_blank" : undefined}
              rel={"external" in link && link.external ? "noreferrer noopener" : undefined}
              className="text-base font-medium leading-[1.2] tracking-[-0.32px] text-content-secondary transition-colors hover:text-content-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
