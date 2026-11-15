"use client";

import { useState, type ReactNode } from "react";
import { WalletButton, type WalletButtonState } from "@/components/solana/solana-connect-button";
import type { Wallet } from "@/components/solana/solana-wallet-provider";
import { ConnectedView, EmptyWalletsView, WalletListView } from "@/components/wallet/wallet-sidebar";

// The system program: a real address, so the balance read answers, that belongs to nobody.
const ADDRESS = "11111111111111111111111111111111";
const PHANTOM = { name: "Phantom", icon: "/wallets/phantom.png" };
const WALLETS = [PHANTOM, { name: "Backpack", icon: "/wallets/backpack.png" }, { name: "Solflare", icon: "/wallets/solflare.png" }, { name: "Ledger" }];

const BUTTONS: Array<{ label: string; state: WalletButtonState }> = [
  { label: "Loading", state: { type: "loading" } },
  { label: "Disconnected", state: { type: "disconnected" } },
  { label: "Connecting", state: { type: "connecting" } },
  { label: "Connected", state: { type: "connected", address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", walletName: "Phantom", walletIcon: PHANTOM.icon } },
  { label: "Connected, wallet without an icon", state: { type: "connected", address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", walletName: "Ledger" } },
];

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-frame={title} className="flex flex-col gap-3">
      <h2 className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-content-tertiary">{title}</h2>
      {children}
    </section>
  );
}

/** A panel body at the panel's own width, without the slide-in or the backdrop. */
function Panel({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-md border border-bg-border bg-bg-primary p-6">{children}</div>;
}

export function WalletGallery() {
  const [opened, setOpened] = useState(0);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // stands in for a wallet that declines: the row shows it is waiting, then the reason
  function connect(wallet: Wallet) {
    setError(null);
    setConnecting(wallet.name);
    window.setTimeout(() => {
      setConnecting(null);
      setError(`Connection declined in ${wallet.name}.`);
    }, 1500);
  }

  return (
    <div className="mx-auto flex w-full max-w-[850px] flex-col gap-10 pb-20 pt-10 max-xl:px-[71px] max-lg:px-6 max-md:px-3">
      <p className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-content-tertiary">
        Dev harness · wallet button and panel from fixtures · opened {opened}×
      </p>

      <Frame title="Header button">
        <div className="flex flex-col gap-4">
          {BUTTONS.map(({ label, state }) => (
            <div key={label} className="flex items-center justify-between gap-4 border border-bg-border px-4 py-3">
              <span className="font-mono text-sm text-content-secondary">{label}</span>
              <WalletButton state={state} onOpen={() => setOpened((n) => n + 1)} />
            </div>
          ))}
        </div>
      </Frame>

      <Frame title="Full width, as on a page's connect card">
        <div className="grid max-w-md gap-3">
          <WalletButton fullWidth state={{ type: "loading" }} onOpen={() => undefined} />
          <WalletButton fullWidth state={{ type: "disconnected" }} onOpen={() => undefined} />
          <WalletButton fullWidth state={BUTTONS[3].state} onOpen={() => undefined} />
        </div>
      </Frame>

      <Frame title="Panel · connected">
        <Panel>
          <ConnectedView wallet={PHANTOM} account={{ address: ADDRESS }} active onDisconnect={() => new Promise((done) => window.setTimeout(done, 1200))} onClose={() => undefined} />
        </Panel>
      </Frame>

      <Frame title="Panel · choose a wallet">
        <Panel>
          <WalletListView wallets={WALLETS} onConnect={connect} connectingWallet={connecting} isConnecting={connecting != null} error={error} />
        </Panel>
      </Frame>

      <Frame title="Panel · no wallet installed">
        <Panel>
          <EmptyWalletsView />
        </Panel>
      </Frame>
    </div>
  );
}
