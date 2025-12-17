import { Container } from "@/components/ui/container";

export function Footer() {
  return (
    <footer className="border-t-8 border-yuzu-main bg-black pb-8 pt-16 text-white">
      <Container className="flex flex-col items-center justify-between gap-8 md:flex-row">
        <div className="text-center md:text-left">
          <h2 className="mb-2 text-4xl font-black italic text-yuzu-main">
            YUZU MARKETS
          </h2>
          <p className="max-w-md font-mono text-sm opacity-60">
            Building the future of on-chain options. <br />
            Data sources: Delphi, Paradigm OTC.
          </p>
        </div>
        <div className="flex gap-4">
          <a
            href="#"
            className="flex h-12 w-12 items-center justify-center border-2 border-white text-xl transition-colors hover:border-yuzu-main hover:bg-yuzu-main hover:text-black"
            aria-label="X"
          >
            𝕏
          </a>
          <a
            href="#"
            className="flex h-12 w-12 items-center justify-center border-2 border-white text-xl transition-colors hover:border-yuzu-main hover:bg-yuzu-main hover:text-black"
            aria-label="Telegram"
          >
            TG
          </a>
          <a
            href="#"
            className="flex h-12 w-12 items-center justify-center border-2 border-white text-xl transition-colors hover:border-yuzu-main hover:bg-yuzu-main hover:text-black"
            aria-label="Other"
          >
            👾
          </a>
        </div>
      </Container>
      <div className="mt-12 text-center font-mono text-xs opacity-40">
        © 2025 YUZU MARKETS. NO FINANCIAL ADVICE. JUST VIBES.
      </div>
    </footer>
  );
}


