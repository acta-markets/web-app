import { AppButtonLink } from "@/components/app-ui/app-button";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-white/10 bg-black/40 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="text-lg font-semibold tracking-tight text-white">Acta</div>
      </div>

      <div className="hidden items-center gap-6 text-sm font-semibold md:flex">
        <a
          href="#how-it-works"
          className="text-white/70 hover:text-white"
        >
          How it Works
        </a>
        <a
          href="#solution"
          className="text-white/70 hover:text-white"
        >
          The Solution
        </a>
        <a
          href="#team"
          className="text-white/70 hover:text-white"
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


