# Release 1.0 integration

Local release branch: `feat/release-1.0` in `release-web-app`.
Inputs: `feat/spreads` at `922e503` and `origin/feat/vault-metadata` at `94607f5`.
The original checkouts and branches are unchanged. No push, main merge or deployment.

## Conflict decisions

All 40 conflicted paths were resolved (16 docs-site paths and 24 code/fixture paths).
The entire docs-site tree, including automatically merged files, is exactly the
vault-metadata tree. `git diff --exit-code origin/feat/vault-metadata -- docs-site`
passes. No separate merge of spreads-design was made.

- Keep WS 1.0.0 tagged terms/side, product gates, strict quote identity, spread
  premium validation, order recovery and sponsored transaction verification.
- Keep the vault metadata API, curator/governance identity, token names, APY,
  current cycle, exposure, charts, capacity, last-LP handling and since-entry return.
- Keep the new discriminated SDK capacity, nullable metadata, APR tags and
  cash-settled exposure labels rather than restoring legacy wire shapes.
- Blend the spread ticket/design with vault-metadata's cards, metric tiles,
  governance details and terms. Retain all cycle-history columns, including
  Started, Equity and Positions; the spread design had removed those columns.
- Keep the shared canonical-ATA balance hook, which contains the collateral
  precheck from vault-metadata, rather than duplicating its inline predecessor.
- Retain both branches' test cases and adapt their fixtures to the 1.0.0 schema.

## Integration repairs

The published SDK is pinned to exactly `0.3.0` in package.json and package-lock,
with npm registry resolution and integrity. No SDK local path/override remains.

The input spread branch had cash-put wire/portfolio support but no quote ticket.
Added a product-gated cash-put ticket: wire `{type:"cash_put", strike:K}`;
SDK put-spread `(0,K)` math for collateral and preview; shared accept/recovery.
No alternate transaction-signing implementation was introduced.

Anonymous connections now fetch market descriptors and tokens. The strike tick
comes from `TokenInfo.role` when its tag is `underlying`. Reference changes clear
cached product policy/ticks and request fresh discovery; disconnect also clears
those caches. Both cash flows require an unexpired matching product descriptor.
Physical-only `products=3` exposes CC/CSP only, so neither cash-settled entry point
is shown. Regression tests cover policy removal and cash-put collateral/wire terms.

## Gates

- Typecheck: `npx tsc --noEmit --incremental false`, exit 0, no diagnostics.
- Lint: exit 0; five existing next/image warnings and one existing hook warning.
- Unit tests: 37 files, 422 tests passed. Existing React act warnings remain.
- Production build: exit 0, compiled successfully; 53 static pages generated.
- Docs: `Validated 33 documentation pages and 33 sidebar entries.`

Build environment: APP_ENABLED=true, SOLANA_NETWORK=devnet,
RFQ_WS_URL=wss://devnet-api.acta.markets, API_URL=https://devnet-api.acta.markets
(all NEXT_PUBLIC_ prefixed). No private credentials were copied.

## Browser and compatibility

Evidence, screenshots, scripts and full gate logs:
`/Users/valpaq/.bb/thread-storage/thr_w9mz4i33c8/audit/web/`.
The production build was served locally and driven by installed Playwright
Chromium headless shell. BB Browser Automation could not locate a Chrome binary.
No wallet signing, authentication challenge signing or transaction submission.

The final live devnet pass recorded zero console errors, zero page errors and zero
`invalid_frame` errors. Only Hello and public Get* commands were sent. Selected
spread strikes displayed 9 USDC-Dev collateral; a cash put at 96.5 displayed
96.5 USDC-Dev collateral for 1 SOL.

The live devnet pass covers anonymous WS connection, market discovery, physical
option ticket, spread and cash-put selection, disconnected portfolio, wallet
chooser, vault list and vault detail (cycles, exposure, performance, terms).
Wallet-specific portfolio, returned maker quotes and execution are not established
by this unsigned pass; component/unit tests cover their frontend behavior.

All data/trading paths in this release expect the WS 1.0.0/SDK 0.3.0 schema.
There is no old-wire fallback, including for physical options. Marketing/docs are
independent of that WS connection.

The old beta-api mainnet endpoint currently claims `protocol_version: "1.0.0"`
but returns legacy frames: MarketDescriptors lacks `products`, Tokens lacks tagged
`role`, and EarnSummary uses min_apr/max_apr. An installed-SDK probe produces
`invalid_frame` for MarketDescriptors. The app disconnects on incompatible frames
or legacy APR shape and displays **Trading temporarily unavailable**, asking users
to reload after the backend maintenance window. A browser pass with only the WS
origin redirected to beta-api verifies this view without a JavaScript crash.
This is not a mainnet deployment or a mainnet-configured build.

## SDK issue for the owner

SDK 0.3.0 emits a legacy EarnSummary without the declared required `apr` union,
instead of rejecting it. Reproduced against beta-api with only Hello and
GetEarnSummary; see `sdk-legacy-summary-gap.log`. The frontend rejects that shape
before storing/rendering it, independent of descriptor response order. No SDK code
was changed. The owner should route the SDK validation issue to its maintainer.

Ship both frontends only in the coordinated backend maintenance window. Signed
wallet/RFQ/execution checks remain outside this task's authorization.
