"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { address, createSolanaRpc } from "@solana/kit";
import { fetchConfigAccountByAddress, findConfigPda } from "@acta-markets/ts-sdk/chain";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { SolanaConnectButton } from "@/components/solana/solana-connect-button";
import { AppButton } from "@/components/app-ui/app-button";
import { AppTabs } from "@/components/app-ui/app-tabs";
import { formatStrikePrice } from "@/lib/markets";
import { getRpcEndpoint } from "@/lib/network";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { getTokenLogoSrc } from "@/lib/token-assets";
import { getTokenMint, normalizeTokenSymbol } from "@/lib/tokens";
import { collateralShortfallMessage } from "@/lib/rfq-collateral";
import { exactAtoms, requireStrikeTick, spreadCollateralCheck, spreadTerms, wireInteger, type SpreadProduct } from "@/lib/spreads";
import { RfqFlowModal, type RfqOrderPreview } from "./rfq-flow-modal";
import type { SpreadFees } from "./spread-preview";
import { useTokenBalance } from "./use-token-balance";

const FIELD_GROUP = "flex flex-col gap-2";
const LABEL = "font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary";
const FIELD = "w-full border border-bg-border bg-bg-primary p-3 font-mono text-base leading-[1.2] text-content-primary outline-none focus:border-accent-primary";

/** "Nov 01 · 3d", the way the yield market labels its expiries. */
function expiryLabel(expirySecs: number) {
  const msUntil = expirySecs * 1000 - Date.now();
  const hours = Math.max(1, Math.ceil(msUntil / 3_600_000));
  const days = Math.max(1, Math.ceil(msUntil / 86_400_000));
  const date = new Date(expirySecs * 1000).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  return `${date} · ${days <= 1 || hours < 24 ? `${hours}h` : `${days}d`}`;
}

export function SpreadMarket({ asset, onBusyChange, cashPut = false }: { asset: string; cashPut?: boolean; onBusyChange: (busy: boolean) => void }) {
  const rfq = useRfqContext();
  const wallet = useSolana();
  const id = useId();
  const [selectedProduct, setProduct] = useState<SpreadProduct>("call_spread");
  const [marketId, setMarketId] = useState("");
  const [lower, setLower] = useState<number | null>(null);
  const [upper, setUpper] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [feeSnapshot, setFeeSnapshot] = useState<{ mint: string; fees: SpreadFees } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<RfqOrderPreview | null>(null);
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const rpc = useMemo(() => createSolanaRpc(getRpcEndpoint()), []);
  const symbol = normalizeTokenSymbol(asset);
  const mint = rfq.earnSummary?.find(row => normalizeTokenSymbol(row.underlying_symbol) === symbol)?.underlying_mint ?? getTokenMint(symbol);
  const eligibleProducts = rfq.marketDescriptors.filter(d => d.market.underlying_mint === mint && d.products.includes(d.market.is_put ? "put_spread" : "call_spread") && Number(d.market.expiry_ts) * 1000 > Date.now());
  const product = cashPut ? "cash_put" : eligibleProducts.some(d => d.market.is_put === (selectedProduct === "put_spread")) ? selectedProduct : eligibleProducts[0]?.market.is_put ? "put_spread" : "call_spread";
  const { getTokenMarketsInfo, isConnected } = rfq;
  useEffect(() => {
    if (!mint || !isConnected) return;
    getTokenMarketsInfo(mint);
    const timer = window.setInterval(() => getTokenMarketsInfo(mint), 30_000);
    return () => window.clearInterval(timer);
  }, [mint, isConnected, getTokenMarketsInfo]);
  const metadata = rfq.tokenMarketsInfo && rfq.tokenMarketsInfo.underlyingMint === mint ? rfq.tokenMarketsInfo.data : null;
  const available = rfq.marketDescriptors.filter(d => d.market.underlying_mint === mint
    && d.market.is_put === (product !== "call_spread")
    && d.products.includes(product)
    && Number(d.market.expiry_ts) * 1000 > Date.now());
  const descriptor = available.find(d => d.market.market_pda === marketId) ?? available[0];
  const quoteMint = descriptor?.market.quote_mint;
  const quoteSymbol = descriptor?.quote_symbol ?? "quote token";
  const fees = feeSnapshot?.mint === quoteMint ? feeSnapshot?.fees ?? null : null;
  useEffect(() => {
    if (!quoteMint) return;
    let live = true;
    const refresh = async () => {
      try {
        const config = await fetchConfigAccountByAddress(rpc, await findConfigPda(address(quoteMint)));
        if (live) setFeeSnapshot({ mint: quoteMint, fees: { premiumBps: config.account.protocolFeeBpsPremium, volumeBps: config.account.protocolFeeBpsVolume } });
      } catch { if (live) setFeeSnapshot(null); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [rpc, quoteMint]);
  const balance = useTokenBalance(wallet.selectedAccount?.address, quoteMint, false);
  const tick = mint ? rfq.strikeTicks.get(mint) : undefined;
  const ladder = useMemo(() => {
    const spot = metadata?.reference_price;
    if (!spot || !Number.isSafeInteger(spot) || !tick) return [];
    const center = BigInt(spot) / tick * tick;
    const step = (center / 20n / tick || 1n) * tick;
    return Array.from({ length: 21 }, (_, i) => center + BigInt(i - 10) * step)
      .filter(value => value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)).map(Number);
  }, [metadata?.reference_price, tick]);
  let terms: ReturnType<typeof spreadTerms> | null = null;
  let invalid: string | null = null;
  try {
    if (descriptor && (cashPut || lower != null) && upper != null) {
      const atoms = exactAtoms(quantity, descriptor.underlying_decimals);
      const rule = descriptor.size_rule;
      if (atoms < BigInt(rule.min_size) || atoms > BigInt(rule.max_size) || (rule.step > 0 && (atoms - BigInt(rule.min_size)) % BigInt(rule.step) !== 0n)) throw new Error("Size must match the market size limits and step.");
      terms = spreadTerms(cashPut ? "put_spread" : product as SpreadProduct, cashPut ? 0 : lower!, upper, atoms, descriptor.underlying_decimals, descriptor.quote_decimals, requireStrikeTick(rfq.strikeTicks, descriptor.market.underlying_mint));
    }
  } catch (error) { invalid = error instanceof Error ? error.message : String(error); }
  const check = terms ? spreadCollateralCheck(terms, balance) : null;
  const shortfall = check && balance != null ? collateralShortfallMessage(check.required, balance, { symbol: quoteSymbol, decimals: descriptor!.quote_decimals }) : null;
  const cash = (atoms: bigint) => `${(Number(atoms) / 10 ** (descriptor?.quote_decimals ?? 6)).toLocaleString("en-US", { maximumFractionDigits: descriptor?.quote_decimals ?? 6 })} ${quoteSymbol}`;
  const wireTerms = cashPut ? { type: "cash_put" as const, strike: upper! } : { type: product as SpreadProduct, lower_strike: lower!, upper_strike: upper! };
  const request = () => {
    if (!terms || !descriptor || !check?.sufficient || !fees || !rfq.isAuthenticated) return;
    if (rfq.referralStatus === "required") { rfq.openReferralGate(); return; }
    setMessage(null);
    setPreview({ asset: symbol, terms: wireTerms, quantity: wireInteger(terms.quantity),
      strikeDisplay: cashPut ? formatStrikePrice(upper! / 1e9) : `${formatStrikePrice(lower! / 1e9)} / ${formatStrikePrice(upper! / 1e9)}`, quantityDisplay: `${quantity} ${symbol}`,
      expiryTs: Number(descriptor.market.expiry_ts), spread: { terms, fees, quoteSymbol },
    });
    setNonce(n => n + 1);
    rfq.submitRfq({ market: descriptor.market.market_pda, terms: wireTerms, quantity: wireInteger(terms.quantity) });
    setOpen(true);
  };
  const changeProduct = (value: SpreadProduct) => { rfq.cancelRfq(); setProduct(value); setLower(null); setUpper(null); setMarketId(""); };
  // the short leg is the lower strike of a call spread and the upper strike of a put spread
  const [lowerLabel, upperLabel] = product === "call_spread" ? ["Sell at", "Buy at"] : ["Buy at", "Sell at"];
  const strikeOptions = (selected: number | null) => Array.from(new Set([...ladder, ...(selected == null ? [] : [selected])])).sort((a, b) => a - b);
  return <div>
    <header className="mx-auto w-full max-w-[850px] space-y-6 pb-12 pt-8 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pb-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-0.5 font-mono text-base leading-[1.2] tracking-[-0.32px]">
        <Link href="/trade" className="text-content-secondary hover:text-content-primary">Trade</Link>
        <span className="text-content-primary">/</span>
        <span className="text-content-primary">Market</span>
      </nav>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-bg-border bg-content-primary max-md:h-10 max-md:w-10">
            <img src={getTokenLogoSrc(symbol)} alt="" className="h-full w-full object-cover" />
          </div>
          <h1 className="font-space text-[64px] font-semibold leading-[1.2] tracking-[-1.28px] text-content-primary max-md:text-[40px]">{symbol}</h1>
        </div>
        <p className="font-mono text-base leading-[1.2] tracking-[-0.32px] text-content-secondary">{cashPut ? "Sell a cash-settled put. Choose a strike, post quote collateral and receive a premium upfront. Settlement pays cash; you do not receive the underlying asset." : "Sell a call or put spread. Choose two strikes and receive a premium upfront."}</p>
      </div>
    </header>
    <div className="mx-auto w-full max-w-[850px] space-y-5 pb-16 max-xl:px-[71px] max-lg:px-6 max-md:px-3">
      {!cashPut && <AppTabs value={product as SpreadProduct} onChange={changeProduct} ariaLabel="Spread type" options={([{ value: "call_spread", label: "Sell call spread" }, { value: "put_spread", label: "Sell put spread" }] as const).filter(option => rfq.marketDescriptors.some(d => d.market.underlying_mint === mint && d.market.is_put === (option.value === "put_spread") && d.products.includes(option.value) && Number(d.market.expiry_ts) * 1000 > Date.now()))} />}
      <div className={FIELD_GROUP}>
        <label htmlFor={`${id}-expiry`} className={LABEL}>Expiry</label>
        <select id={`${id}-expiry`} className={FIELD} value={descriptor?.market.market_pda ?? ""} onChange={e => { rfq.cancelRfq(); setMarketId(e.target.value); setLower(null); setUpper(null); }}>
          {!available.length && <option value="">Waiting for available markets</option>}
          {available.map(d => <option key={d.market.market_pda} value={d.market.market_pda}>{expiryLabel(Number(d.market.expiry_ts))}</option>)}
        </select>
      </div>
      <div className={cashPut ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 gap-4 sm:grid-cols-2"}>
        {!cashPut && <div className={FIELD_GROUP}>
          <label htmlFor={`${id}-lower`} className={LABEL}>{lowerLabel}</label>
          <select id={`${id}-lower`} className={FIELD} value={lower ?? ""} onChange={e => setLower(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose a strike</option>
            {strikeOptions(lower).map(strike => <option key={strike} value={strike}>{formatStrikePrice(strike / 1e9)}</option>)}
          </select>
        </div>}
        <div className={FIELD_GROUP}>
          <label htmlFor={`${id}-upper`} className={LABEL}>{cashPut ? "Strike" : upperLabel}</label>
          <select id={`${id}-upper`} className={FIELD} value={upper ?? ""} onChange={e => setUpper(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose a strike</option>
            {strikeOptions(upper).map(strike => <option key={strike} value={strike} disabled={lower != null && strike <= lower}>{formatStrikePrice(strike / 1e9)}</option>)}
          </select>
        </div>
      </div>
      <div className={FIELD_GROUP}>
        <label htmlFor={`${id}-size`} className={LABEL}>Size ({symbol})</label>
        <input id={`${id}-size`} className={FIELD} inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} />
        <p className="font-mono text-sm leading-[1.2] tracking-[-0.28px] text-content-secondary">
          {check ? <>Collateral <span className="tabular-nums text-content-primary">{cash(check.required)}</span> · </> : null}
          Available <span className="tabular-nums text-content-primary">{balance == null ? "…" : cash(balance)}</span>
        </p>
      </div>
      {(invalid || shortfall || message) && <p role="alert" className="font-mono text-sm text-error">{invalid || shortfall || message}</p>}
      {terms && !fees && <p className="font-mono text-sm text-content-secondary">Loading protocol fees…</p>}
      {!wallet.selectedAccount ? <SolanaConnectButton fullWidth />
        : !rfq.isAuthenticated ? <AppButton size="lg" className="w-full font-mono" onClick={() => void rfq.authenticate(wallet.selectedAccount!.address, wallet.signMessage).catch(error => setMessage(String(error)))}>Sign in to trade</AppButton>
        : <AppButton size="lg" className="w-full font-mono" disabled={!terms || !check?.sufficient || !fees} onClick={request}>
          {cashPut ? "Get cash put quote" : "Get spread quote"}
          <img src="/chevron-right-duo-dark.svg" alt="" className="h-6 w-6" />
        </AppButton>}
    </div>
    <RfqFlowModal onBusyChange={onBusyChange} open={open} onClose={() => setOpen(false)} requestNonce={nonce} preview={preview} walletAddress={wallet.selectedAccount?.address ?? null}
      backendUrl={getRfqBackendUrl()} signTransaction={wallet.signTransaction} rpc={rpc} />
  </div>;
}
