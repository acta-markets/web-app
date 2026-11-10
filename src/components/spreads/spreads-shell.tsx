import { AppButton } from "@/components/app-ui/app-button";
import { AppCard } from "@/components/app-ui/app-card";

/**
 * Spreads — placeholder entry path.
 *
 * The venue already quotes and settles spreads on-chain, and the portfolio already
 * renders spread positions. What is missing is the entry path: a way to pick the two
 * legs and request a quote. This page is the scaffold for that, and nothing more.
 *
 * TODO(spreads) — make it live:
 *   1. Quote flow — request a spread RFQ through RfqProvider / useQuoteRequest with
 *      side "sell" and tagged terms { type: "call_spread" | "put_spread",
 *      lower_strike, upper_strike }; accept only quotes whose side and full strike
 *      pair match (quoteMatchesProduct in src/lib/spreads.ts).
 *   2. Leg selection — pick the two strikes off the server strike_tick ladder
 *      (strikeTicksByMint + requireStrikeTick in src/lib/spreads.ts), enforcing
 *      lower < upper and the asset's tick; choose call_spread vs put_spread.
 *   3. Collateral — require the full spreadCollateral(terms) (ceil of width x qty,
 *      in the quote mint) in the wallet ATA before requesting a quote; block on an
 *      unknown balance. No native-token wrapping for spreads.
 *   4. Products — only call_spread and put_spread belong here; cash_put is its own
 *      ticket. The descriptor must explicitly include the product and be unexpired
 *      (descriptorSupportsCashProduct in src/lib/trade-products.ts).
 *   5. Execution — reuse the existing order hook (accept/sign/submit/recovery); no
 *      new signing path. Surface spreadPreview / spreadPnl for the summary.
 */

const CONTAINER =
  "mx-auto w-full max-w-[850px] pb-16 pt-12 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-8";

export function SpreadsShell() {
  return (
    <div className={CONTAINER}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-space text-[64px] font-semibold leading-[1.2] tracking-[-1.28px] text-content-primary max-md:text-[40px]">
          Spreads
        </h1>
        <p className="max-w-[560px] font-mono text-base leading-[1.55] tracking-[-0.02em] text-content-secondary">
          A spread sells one option and buys another at a further strike, paying a
          premium now against a fixed, capped collateral.
        </p>
      </div>

      <AppCard className="mt-8 flex flex-col items-start gap-4 p-6 max-md:p-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent-secondary">
          Coming soon
        </div>
        <p className="font-mono text-base leading-[1.55] tracking-[-0.02em] text-content-secondary">
          Spreads are not open for trading yet. When they are, this is where you will
          pick the two strikes, set the size, and request a quote.
        </p>
        <AppButton disabled>Trade spreads</AppButton>
      </AppCard>
    </div>
  );
}
