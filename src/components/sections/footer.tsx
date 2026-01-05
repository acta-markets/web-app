import { Container } from "@/components/ui/container";

const links = [
  { label: "About", href: "/about" },
  { label: "Docs", href: "#" },
  { label: "Security", href: "#" },
  { label: "Telegram", href: "#" },
  { label: "X", href: "#" },
];

export function Footer() {
  return (
    <footer className="px-6 pb-8 pt-12">
      <Container>
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <nav className="flex flex-wrap justify-center gap-x-8 gap-y-3">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-content-secondary transition-colors hover:text-accent-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="text-xs text-content-tertiary">
            © 2026 Acta
          </div>
        </div>
      </Container>
    </footer>
  );
}
