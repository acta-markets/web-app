/**
 * Everything the app keeps in the browser, in one list. A new key belongs here, with who
 * owns it and what clears it, before it is written anywhere.
 *
 * Server data is not in this list by key: it goes through the query cache
 * (`query-client.ts`) into IndexedDB database `acta-state`, one entry per read, named
 * `[backend, "public" | wallet, resource, ...]`.
 */
export const BROWSER_KEYS = [
  { key: "acta_last_wallet", area: "local", scope: "device", owner: "src/lib/wallet-memory.ts", holds: "name and public address of the wallet last connected", cleared: "on disconnect" },
  { key: "acta_rfq_session:<backend>:<wallet>", area: "local", scope: "backend + wallet", owner: "src/lib/state/session-store.ts", holds: "trading session id and its expiry", cleared: "when refused by the server, on disconnect, and ignored once expired" },
  { key: "acta_rfq_ws_session", area: "local", scope: "device", owner: "src/lib/state/session-store.ts", holds: "the session as it was kept before, one wallet at a time; read once and removed", cleared: "on the next sign-in of that wallet" },
  { key: "acta_rfq_unfinished_order:<backend>:<wallet>", area: "local", scope: "backend + wallet", owner: "src/components/market/use-rfq-order.ts", holds: "an accepted order that has not finished, so it can be reconciled after a reload", cleared: "when the order is confirmed or failed" },
  { key: "acta_welcome_seen:<backend>:<wallet>", area: "local", scope: "backend + wallet", owner: "src/lib/onboarding.ts", holds: "that the first sign-in welcome was shown", cleared: "never" },
  { key: "acta_trade_draft:<backend>", area: "local", scope: "backend", owner: "src/lib/trade/draft.ts", holds: "the Trade page's setup: asset, direction, mode, and for a day the price, date and size", cleared: "never; overwritten as the form changes" },
  { key: "acta_ref_pending", area: "local", scope: "device", owner: "src/components/referral/ref-capture.tsx", holds: "a referral code from a link, until it is redeemed", cleared: "when redeemed" },
  { key: "acta.flipCoachSeen", area: "local", scope: "device", owner: "src/components/trade/sentence/thesis-chart.tsx", holds: "that the chart's flip hint was shown", cleared: "never" },
  { key: "acta.rfq.debug", area: "local", scope: "device", owner: "src/components/market/use-rfq-order.ts", holds: "the two transactions of a wallet-changed-the-transaction mismatch, for debugging", cleared: "overwritten by the next one" },
] as const;
