import { AppButtonLink } from "@/components/app-ui/app-button";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 flex w-full items-center justify-between bg-bg-primary/40 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="logo text-xl text-content-primary">ACTA</div>
      </div>

      <div className="hidden items-center gap-6 text-sm font-semibold md:flex">
        <a
          href="#how-it-works"
          className="text-content-secondary hover:text-content-primary"
        >
          How it Works
        </a>
        <a
          href="#solution"
          className="text-content-secondary hover:text-content-primary"
        >
          The Solution
        </a>
        <a
          href="#team"
          className="text-content-secondary hover:text-content-primary"
        >
          Team
        </a>
      </div>

      <AppButtonLink href="#whitelist" variant="secondary">
        Join Beta
      </AppButtonLink>
    </nav>
  );
}
