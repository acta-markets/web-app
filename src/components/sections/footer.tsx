import Link from "next/link";
import { ActaLogo } from "@/components/acta-logo";

const links = [
  { label: "Docs", href: "#" },
  { label: "Security", href: "#" },
  { label: "Telegram", href: "#" },
  { label: "X", href: "#" },
];

export function Footer() {
  return (
    <footer className="border-t border-bg-border">
      <div className="mx-auto flex h-[76px] w-full items-center justify-between px-[295px] py-6 max-xl:px-[71px] max-lg:px-6 max-md:h-auto max-md:flex-col max-md:gap-3 max-md:py-6">
        <Link href="/earn">
          <ActaLogo className="h-7" />
        </Link>

        <nav className="flex flex-wrap items-center justify-center gap-4">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
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
