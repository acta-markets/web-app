import { ButtonLink } from "@/components/ui/button";

export function Navbar() {
  return (
    <nav className="fixed left-0 top-0 z-50 flex w-full items-center justify-between border-b-4 border-black bg-yuzu-main px-6 py-4 shadow-neo-sm">
      <div className="text-3xl font-black italic uppercase tracking-tighter">
        Yuzu<span className="bg-black px-1 not-italic text-white">Markets</span>
      </div>

      <div className="hidden gap-8 text-lg font-bold md:flex">
        <a
          href="#how-it-works"
          className="hover:underline decoration-4 decoration-black underline-offset-4"
        >
          How it Works
        </a>
        <a
          href="#solution"
          className="hover:underline decoration-4 decoration-black underline-offset-4"
        >
          The Solution
        </a>
        <a
          href="#team"
          className="hover:underline decoration-4 decoration-black underline-offset-4"
        >
          Team
        </a>
      </div>

      <ButtonLink href="#whitelist" variant="secondary">
        Join Beta
      </ButtonLink>
    </nav>
  );
}


