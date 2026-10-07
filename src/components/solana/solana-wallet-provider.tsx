"use client";

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, type ReactNode } from "react";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { VersionedTransaction } from "@solana/web3.js";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet" ? "mainnet-beta" : "devnet";
const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");
const WS_ENDPOINT = RPC_ENDPOINT.replace("https://", "wss://").replace("http://", "ws://");
const CHAIN = NETWORK === "mainnet-beta" ? "solana:mainnet" : "solana:devnet";

const rpc = createSolanaRpc(RPC_ENDPOINT);
const rpcSubscriptions = createSolanaRpcSubscriptions(WS_ENDPOINT);

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
  
  connectWallet: (wallet: Wallet) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  
  signTransaction: <T extends { serialize(): Uint8Array }>(transaction: T) => Promise<T>;

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
  }, []);
  
  const isConnected = useMemo(() => {
    return !!(selectedWallet && selectedAccount);
  }, [selectedWallet, selectedAccount]);
  
  const connectWallet = useCallback(async (wallet: Wallet) => {
    try {
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
      }
    } catch (error) {
      console.error("[SolanaProvider] Failed to connect:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, []);
  
  const disconnectWallet = useCallback(async () => {
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
  }, [selectedWallet]);
  
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
      connectWallet,
      disconnectWallet,
      signMessage,
      signTransaction,
      signAllTransactions,
    }),
    [wallets, selectedWallet, selectedAccount, isConnected, isConnecting, isReady, connectWallet, disconnectWallet, signMessage, signTransaction, signAllTransactions]
  );
  
  return (
    <SolanaContext.Provider value={contextValue}>
      {children}
    </SolanaContext.Provider>
  );
}
