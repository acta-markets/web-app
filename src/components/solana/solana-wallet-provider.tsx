"use client";

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, type ReactNode } from "react";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { VersionedTransaction } from "@solana/web3.js";

import { getRpcEndpoint, getWalletChain } from "@/lib/network";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { forgetWallet } from "@/lib/state/keys";
import { useLocalStore } from "@/lib/state/local-store";
import { clearSession } from "@/lib/state/session-store";
import { clearLastWallet, lastWalletStore, pickAccount, readLastWallet, writeLastWallet } from "@/lib/wallet-memory";

const RPC_ENDPOINT = getRpcEndpoint();
const WS_ENDPOINT = RPC_ENDPOINT.replace("https://", "wss://").replace("http://", "ws://");
const CHAIN = getWalletChain();

const rpc = createSolanaRpc(RPC_ENDPOINT);
const rpcSubscriptions = createSolanaRpcSubscriptions(WS_ENDPOINT);

/** How long after the page is ready a remembered wallet's extension is waited for before the app stops expecting it. */
const RESTORE_GRACE_MS = 1_500;

export interface WalletAccount {
  address: string;
  publicKey?: Uint8Array;
}

export interface Wallet {
  name: string;
  icon?: string;
  accounts: WalletAccount[];
}

interface SolanaContextState {
  rpc: ReturnType<typeof createSolanaRpc>;
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>;
  chain: string;
  
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  selectedAccount: WalletAccount | null;
  isConnected: boolean;
  isConnecting: boolean;
  isReady: boolean;
  /** The wallet this browser connected with last time, to put first in the list; null when none is remembered. */
  lastWalletName: string | null;
  /**
   * The wallet the app expects back: the one remembered from last time, while it is still
   * being reconnected. Pages show that wallet's last-known view instead of asking to
   * connect. Null once it is connected, has declined, or was never remembered.
   */
  expectedAccount: WalletAccount | null;
  
  connectWallet: (wallet: Wallet) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  
  signTransaction: <T extends { serialize(): Uint8Array }>(transaction: T) => Promise<T>;

  /**
   * Signs the raw wire bytes and returns raw bytes, through the wallet-standard feature only.
   * Use this for money paths: nothing is deserialised and re-serialised across the wallet
   * boundary, so the message the wallet signs is exactly the message we verified.
   */
  signTransactionBytes: (bytes: Uint8Array) => Promise<Uint8Array>;

  signAllTransactions: (transactions: VersionedTransaction[]) => Promise<VersionedTransaction[]>;
}

const SolanaContext = createContext<SolanaContextState | undefined>(undefined);

export function useSolana() {
  const context = useContext(SolanaContext);
  if (!context) {
    throw new Error("useSolana must be used within a SolanaProvider");
  }
  return context;
}

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<WalletAccount | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const walletsRef = React.useRef<Map<string, any>>(new Map());
  /** Follows this browser's memory of the last wallet, including a disconnect made in another tab. */
  const remembered = useLocalStore(lastWalletStore);
  const lastWalletName = remembered?.name ?? null;
  /** The reconnect of the remembered wallet has been tried, declined, or given up on. */
  const [restoreSettled, setRestoreSettled] = useState(false);
  /** The wallet names a silent reconnect has been tried with on this page load: once each. */
  const restoreTried = React.useRef<Set<string>>(new Set());
  /** True once the visitor connects or disconnects by hand; a silent reconnect never overrides that. */
  const actedRef = React.useRef(false);

  /**
   * Reconnects the wallet used last time without asking: `silent` means the wallet answers
   * only if it already trusts this site, and shows nothing otherwise. A wallet that is locked
   * or no longer trusts the site stays remembered and is simply not connected.
   */
  const restoreLastWallet = useCallback(async () => {
    const remembered = readLastWallet();
    if (!remembered || actedRef.current) {
      setRestoreSettled(true);
      return;
    }
    if (restoreTried.current.has(remembered.name)) return;
    const underlyingWallet = walletsRef.current.get(remembered.name);
    const connectFeature = underlyingWallet?.features["standard:connect"];
    // not registered yet: extensions announce themselves at their own pace, and the grace period covers it
    if (!connectFeature) return;
    restoreTried.current.add(remembered.name);
    setIsConnecting(true);
    try {
      await connectFeature.connect({ silent: true });
      if (actedRef.current) return;
      const accounts: WalletAccount[] = underlyingWallet.accounts.map((a: any) => ({ address: a.address, publicKey: a.publicKey }));
      const account = pickAccount(accounts, remembered.address);
      if (!account) return;
      setSelectedWallet({ name: underlyingWallet.name, icon: underlyingWallet.icon, accounts });
      setSelectedAccount(account);
      writeLastWallet({ name: underlyingWallet.name, address: account.address });
    } catch (error) {
      console.warn("[SolanaProvider] Could not reconnect the last wallet:", error);
    } finally {
      setIsConnecting(false);
      setRestoreSettled(true);
    }
  }, []);
  
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    import("@wallet-standard/core").then(({ getWallets }) => {
      const walletsApi = getWallets();
      
      const updateWallets = () => {
        const registered = walletsApi.get();
        const solanaWallets = registered.filter(w => 
          w.chains?.some((c: string) => c.startsWith("solana:"))
        );
        
        walletsRef.current.clear();
        solanaWallets.forEach(w => walletsRef.current.set(w.name, w));
        
        setWallets(solanaWallets.map(w => ({
          name: w.name,
          icon: w.icon,
          accounts: w.accounts.map((a: any) => ({
            address: a.address,
            publicKey: a.publicKey
          }))
        })));
        
        console.log("[SolanaProvider] Wallets updated:", solanaWallets.map(w => w.name));
        // wallets register one by one after the page loads; the remembered one may be any of them
        void restoreLastWallet();
      };
      
      updateWallets();
      setIsReady(true);
      
      const offRegister = walletsApi.on("register", updateWallets);
      const offUnregister = walletsApi.on("unregister", updateWallets);
      
      (window as any).__solanaWalletCleanup = () => {
        offRegister();
        offUnregister();
      };
    });
    
    return () => {
      if ((window as any).__solanaWalletCleanup) {
        (window as any).__solanaWalletCleanup();
        delete (window as any).__solanaWalletCleanup;
      }
    };
  }, [restoreLastWallet]);
  
  const isConnected = useMemo(() => {
    return !!(selectedWallet && selectedAccount);
  }, [selectedWallet, selectedAccount]);

  // A remembered wallet that has not announced itself shortly after the page is ready is not coming.
  useEffect(() => {
    if (!isReady || restoreSettled) return;
    const id = window.setTimeout(() => setRestoreSettled(true), RESTORE_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [isReady, restoreSettled]);

  const expectedAccount = useMemo<WalletAccount | null>(
    () => (!isConnected && !restoreSettled && remembered ? { address: remembered.address } : null),
    [isConnected, restoreSettled, remembered],
  );

  // Disconnecting in one tab disconnects them all: the wallet was forgotten there, so it is let go here.
  const rememberedBefore = React.useRef(remembered);
  useEffect(() => {
    const before = rememberedBefore.current;
    rememberedBefore.current = remembered;
    if (before === null || remembered !== null || !selectedAccount) return;
    void forgetWallet(selectedAccount.address);
    setSelectedWallet(null);
    setSelectedAccount(null);
  }, [remembered, selectedAccount]);
  
  const connectWallet = useCallback(async (wallet: Wallet) => {
    try {
      actedRef.current = true;
      setRestoreSettled(true);
      setIsConnecting(true);
      console.log("[SolanaProvider] Connecting to:", wallet.name);
      
      const underlyingWallet = walletsRef.current.get(wallet.name);
      if (!underlyingWallet) {
        throw new Error("Wallet not found in registry");
      }
      
      const connectFeature = underlyingWallet.features["standard:connect"];
      if (!connectFeature) {
        throw new Error("Wallet does not support connect");
      }
      
      await connectFeature.connect();
      
      const accounts = underlyingWallet.accounts.map((a: any) => ({
        address: a.address,
        publicKey: a.publicKey
      }));
      
      console.log("[SolanaProvider] Connected accounts:", accounts);
      
      if (accounts.length > 0) {
        setSelectedWallet({
          name: underlyingWallet.name,
          icon: underlyingWallet.icon,
          accounts
        });
        setSelectedAccount(accounts[0]);
        // remembered for the next visit: the name and the public address only
        writeLastWallet({ name: underlyingWallet.name, address: accounts[0].address });
      }
    } catch (error) {
      console.error("[SolanaProvider] Failed to connect:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, []);
  
  const disconnectWallet = useCallback(async () => {
    // Leaving is a choice: the wallet is forgotten, so the next visit does not reconnect it.
    actedRef.current = true;
    setRestoreSettled(true);
    clearLastWallet();
    // Disconnecting signs the wallet out on this device and takes its data with it: its
    // trading session, and everything of its own that was kept to show on the next visit.
    if (selectedAccount) {
      clearSession(getRfqBackendUrl(), selectedAccount.address);
      void forgetWallet(selectedAccount.address);
    }
    try {
      if (selectedWallet) {
        const underlyingWallet = walletsRef.current.get(selectedWallet.name);
        if (underlyingWallet) {
          const disconnectFeature = underlyingWallet.features["standard:disconnect"];
          if (disconnectFeature) {
            await disconnectFeature.disconnect();
          }
        }
      }
      setSelectedWallet(null);
      setSelectedAccount(null);
    } catch (error) {
      console.error("[SolanaProvider] Failed to disconnect:", error);
    }
  }, [selectedWallet, selectedAccount]);
  
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!selectedWallet || !selectedAccount) {
      throw new Error("No wallet connected");
    }
    
    console.log("[SolanaProvider] Signing message, length:", message.length);
    console.log("[SolanaProvider] Using wallet:", selectedWallet.name);
    console.log("[SolanaProvider] Account:", selectedAccount.address);
    
    const underlyingWallet = walletsRef.current.get(selectedWallet.name);
    if (!underlyingWallet) {
      throw new Error("Wallet not found in registry");
    }
    
    console.log("[SolanaProvider] Wallet features:", Object.keys(underlyingWallet.features));
    
    const signMessageFeature = underlyingWallet.features["solana:signMessage"];
    if (!signMessageFeature?.signMessage) {
      throw new Error("Wallet does not support message signing");
    }
    
    const account = underlyingWallet.accounts.find(
      (a: any) => a.address === selectedAccount.address
    );
    
    if (!account) {
      throw new Error("Account not found in wallet");
    }

    const mutableMessage = new Uint8Array(message);
    
    const isPhantomWallet = selectedWallet.name.toLowerCase().includes("phantom");
    if (isPhantomWallet && typeof window !== "undefined") {
      const maybeWindow = window as unknown as {
        phantom?: { solana?: { signMessage?: (msg: Uint8Array, display?: string) => Promise<{ signature: Uint8Array } | Uint8Array> } };
        solana?: { isPhantom?: boolean; signMessage?: (msg: Uint8Array, display?: string) => Promise<{ signature: Uint8Array } | Uint8Array> };
      };
      const phantomProvider =
        maybeWindow.phantom?.solana ??
        (maybeWindow.solana?.isPhantom ? maybeWindow.solana : undefined);

      if (phantomProvider?.signMessage) {
        try {
          console.log("[SolanaProvider] Using Phantom injected signMessage...");
          const signed = await phantomProvider.signMessage(mutableMessage, "utf8");
          const signature = signed instanceof Uint8Array ? signed : signed.signature;
          console.log("[SolanaProvider] Got Phantom signature, length:", signature.length);
          return signature;
        } catch (err) {
          console.warn("[SolanaProvider] Phantom injected signMessage failed, falling back to Wallet Standard:", err);
        }
      }
    }

    console.log("[SolanaProvider] Calling Wallet Standard signMessage...");
    const results = await signMessageFeature.signMessage({
      account,
      message: mutableMessage,
    });

    console.log("[SolanaProvider] Got signature, length:", results[0].signature.length);
    return results[0].signature;
  }, [selectedWallet, selectedAccount]);
  
  const signTransaction = useCallback(async <T extends { serialize(): Uint8Array }>(transaction: T): Promise<T> => {
    if (!selectedWallet || !selectedAccount) {
      throw new Error("No wallet connected");
    }
    
    console.log("[SolanaProvider] Signing transaction");
    console.log("[SolanaProvider] Using wallet:", selectedWallet.name);
    console.log("[SolanaProvider] Account:", selectedAccount.address);
    
    const underlyingWallet = walletsRef.current.get(selectedWallet.name);
    if (!underlyingWallet) {
      throw new Error("Wallet not found in registry");
    }
    
    console.log("[SolanaProvider] Wallet features:", Object.keys(underlyingWallet.features));
    
    const signTransactionFeature = underlyingWallet.features["solana:signTransaction"];
    if (!signTransactionFeature?.signTransaction) {
      throw new Error("Wallet does not support transaction signing");
    }
    
    const account = underlyingWallet.accounts.find(
      (a: any) => a.address === selectedAccount.address
    );
    
    if (!account) {
      throw new Error("Account not found in wallet");
    }
    
    const isPhantomWallet = selectedWallet.name.toLowerCase().includes("phantom");
    if (isPhantomWallet && typeof window !== "undefined") {
      const maybeWindow = window as unknown as {
        phantom?: { solana?: { signTransaction?: (tx: unknown) => Promise<unknown> } };
        solana?: { isPhantom?: boolean; signTransaction?: (tx: unknown) => Promise<unknown> };
      };
      const phantomProvider =
        maybeWindow.phantom?.solana ??
        (maybeWindow.solana?.isPhantom ? maybeWindow.solana : undefined);

      if (phantomProvider?.signTransaction) {
        try {
          console.log("[SolanaProvider] Using Phantom injected signTransaction...");
          const signedTx = await phantomProvider.signTransaction(transaction as unknown);
          console.log("[SolanaProvider] Phantom signTransaction succeeded");
          return signedTx as T;
        } catch (err) {
          console.warn("[SolanaProvider] Phantom injected signTransaction failed, falling back to Wallet Standard:", err);
        }
      }
    }

    const serializedTx = transaction.serialize();
    console.log("[SolanaProvider] Transaction bytes length:", serializedTx.length);
    
    console.log("[SolanaProvider] Calling Wallet Standard signTransaction...");
    const results = await signTransactionFeature.signTransaction({
      account,
      transaction: serializedTx,
      chain: CHAIN,
    });
    
    console.log("[SolanaProvider] Got signed transaction");
    
    const { VersionedTransaction } = await import("@solana/web3.js");
    const signedTx = VersionedTransaction.deserialize(results[0].signedTransaction);
    
    return signedTx as unknown as T;
  }, [selectedWallet, selectedAccount]);
  
  const signTransactionBytes = useCallback(async (bytes: Uint8Array): Promise<Uint8Array> => {
    if (!selectedWallet || !selectedAccount) throw new Error("No wallet connected");
    const underlyingWallet = walletsRef.current.get(selectedWallet.name);
    if (!underlyingWallet) throw new Error("Wallet not found in registry");
    const feature = underlyingWallet.features["solana:signTransaction"];
    if (!feature?.signTransaction) throw new Error("Wallet does not support transaction signing");
    const account = underlyingWallet.accounts.find((a: { address: string }) => a.address === selectedAccount.address);
    if (!account) throw new Error("Account not found in wallet");
    const results = await feature.signTransaction({ account, transaction: bytes, chain: CHAIN });
    const signed = results[0]?.signedTransaction;
    if (!signed) throw new Error("Wallet returned no signed transaction");
    return signed;
  }, [selectedWallet, selectedAccount]);

  const signAllTransactions = useCallback(async (transactions: VersionedTransaction[]): Promise<VersionedTransaction[]> => {
    if (!selectedWallet || !selectedAccount) {
      throw new Error("No wallet connected");
    }
    const underlyingWallet = walletsRef.current.get(selectedWallet.name);
    const feature = underlyingWallet?.features["solana:signTransaction"];
    const account = underlyingWallet?.accounts.find((a: any) => a.address === selectedAccount.address);
    if (!feature?.signTransaction || !account) {
      throw new Error("Wallet does not support transaction signing");
    }
    const results = await feature.signTransaction(
      ...transactions.map((transaction) => ({ account, transaction: transaction.serialize(), chain: CHAIN })),
    );
    const { VersionedTransaction } = await import("@solana/web3.js");
    return results.map((result: { signedTransaction: Uint8Array }) =>
      VersionedTransaction.deserialize(result.signedTransaction),
    );
  }, [selectedWallet, selectedAccount]);

  const contextValue = useMemo<SolanaContextState>(
    () => ({
      rpc,
      rpcSubscriptions,
      chain: CHAIN,
      wallets,
      selectedWallet,
      selectedAccount,
      isConnected,
      isConnecting,
      isReady,
      lastWalletName,
      expectedAccount,
      connectWallet,
      disconnectWallet,
      signMessage,
      signTransaction,
      signTransactionBytes,
      signAllTransactions,
    }),
    [wallets, selectedWallet, selectedAccount, isConnected, isConnecting, isReady, lastWalletName, expectedAccount, connectWallet, disconnectWallet, signMessage, signTransaction, signTransactionBytes, signAllTransactions]
  );
  
  return (
    <SolanaContext.Provider value={contextValue}>
      {children}
    </SolanaContext.Provider>
  );
}
