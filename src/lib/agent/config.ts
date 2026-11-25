import { DEVNET_API, DEVNET_WS } from "@acta-markets/ts-sdk/ws";

/**
 * Where an agent's session points. Passed in, never read from the web app's environment: the
 * same core runs inside the site's `/mcp` route and inside a process an agent starts itself.
 *
 * Devnet only. A second network arrives as a second value here, not as an environment switch
 * that a stray variable could flip while a key is loaded.
 */
export type AgentNetwork = "devnet";

export type AgentConfig = {
  network: AgentNetwork;
  /** RFQ WebSocket origin; the SDK appends `/taker` */
  wsUrl: string;
  /** HTTP API origin, without `/api/v1` */
  apiUrl: string;
  rpcUrl: string;
  /** the site an agent is told to read more on */
  siteUrl: string;
  clientName: string;
  clientVersion: string;
};

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const DEVNET_SITE = "https://devnet.acta.markets";

export function devnetConfig(over: Partial<Pick<AgentConfig, "rpcUrl" | "clientName" | "clientVersion">> = {}): AgentConfig {
  return {
    network: "devnet",
    wsUrl: DEVNET_WS,
    apiUrl: DEVNET_API,
    rpcUrl: over.rpcUrl || DEVNET_RPC,
    siteUrl: DEVNET_SITE,
    clientName: over.clientName ?? "acta-mcp",
    clientVersion: over.clientVersion ?? "0.0.0",
  };
}

/** Refuses any network but devnet, by name, so a configuration cannot ask for real funds by accident. */
export function requireDevnet(requested: string | undefined): AgentNetwork {
  const network = (requested ?? "devnet").trim().toLowerCase();
  if (network !== "devnet") {
    throw new Error(`This build trades on devnet only; "${network}" is not available. Test funds, never real ones.`);
  }
  return "devnet";
}

/** A transaction or an account on the explorer, on this network. */
export function explorerUrl(config: AgentConfig, kind: "tx" | "account", id: string): string {
  return `https://solscan.io/${kind}/${id}?cluster=${config.network}`;
}
