import { Container } from "@/components/ui/container";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/30 pb-10 pt-16 text-white">
      <Container className="flex flex-col items-center justify-between gap-8 md:flex-row">
        <div className="text-center md:text-left">
          <h2 className="mb-2 text-4xl font-black italic text-yuzu-main">
            ACTA
          </h2>
          <p className="max-w-md text-sm font-semibold text-white/55">
            Building the future of on-chain options. <br />
            Data sources: Delphi, Paradigm OTC.
          </p>
        </div>
        <div className="flex gap-4">
          <a
            href="#"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-black/20 text-sm font-semibold text-white/70 transition-colors hover:border-yuzu-main/40 hover:text-white"
            aria-label="X"
          >
            𝕏
          </a>
          <a
            href="#"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-black/20 text-sm font-semibold text-white/70 transition-colors hover:border-yuzu-main/40 hover:text-white"
            aria-label="Telegram"
          >
            TG
          </a>
          <a
            href="#"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-black/20 text-sm font-semibold text-white/70 transition-colors hover:border-yuzu-main/40 hover:text-white"
            aria-label="Other"
          >
            …
          </a>
        </div>
      </Container>
      <div className="mt-12 text-center font-mono text-xs opacity-40">
        © 2025 ACTA. NO FINANCIAL ADVICE. JUST VIBES.
      </div>
    </footer>
  );
}


