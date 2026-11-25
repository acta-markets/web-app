# @acta-markets/mcp

An MCP server for [Acta](https://devnet.acta.markets/agent): options and curated yield vaults on
Solana. It runs on your machine, over stdio, with a wallet it makes there. Devnet: test funds only.

It reads markets, asks trading desks for live quotes, places trades, funds bought options, and
deposits into and withdraws from the yield vaults, inside limits you set.

## Add it to your agent

It needs Node 22 or later.

```bash
claude mcp add --scope user acta -- npx -y @acta-markets/mcp   # Claude Code
codex mcp add acta -- npx -y @acta-markets/mcp                 # Codex
```

For a client that reads its servers from a file:

```json
{
  "mcpServers": {
    "acta": {
      "command": "npx",
      "args": ["-y", "@acta-markets/mcp"]
    }
  }
}
```

Then ask the agent for its Acta status. The first tool call makes a devnet wallet in
`~/.acta-mcp/wallet.json`, and the venue funds it with test assets on its first sign-in. The key stays
on your machine. The [Agent page](https://devnet.acta.markets/agent) has the one step for each of
more than twenty tools (Claude, ChatGPT, Cursor, Hermes, VS Code, Gemini CLI and others), and a prompt
that makes any other agent do all of this itself.

## What it can lose

An agent that trades can lose what its wallet holds, up to the limits you set. Every trade is final.
A sold option that ends on the wrong side converts the deposit at the strike. A bought option that
ends on the wrong side expires and its premium is gone. A vault sells options with its deposits, so
its share price can fall, and a deposit or a withdrawal there is a request that waits for the cycle
to end.

## Settings

Environment variables of the server, set where your agent keeps its MCP servers.

| Variable | What it does | Default |
|---|---|---|
| `ACTA_MAX_TRADE_USD` | Largest strike times size of one trade, or dollar value of one vault deposit | 2500 |
| `ACTA_DAILY_LIMIT_USD` | Most strike times size and vault deposits in any 24 hours | 10000 |
| `ACTA_ALLOWED_ASSETS` | The only assets it may trade, comma separated | every listed asset |
| `ACTA_READ_ONLY` | Set to 1 and it never trades | off |
| `ACTA_KEYPAIR` | A key file to use in place of the wallet it makes (a JSON array, as `solana-keygen` writes it) | none |
| `ACTA_SIGNER_MODULE` | An ES module that returns a signer, for a KMS or a custody service | none |
| `ACTA_RPC_URL` | Solana devnet RPC | the public one |
| `ACTA_STATE_DIR` | Where the wallet and the order journal are kept | `~/.acta-mcp` |

The server enforces the limits and keeps the day's total on disk, so no tool can raise them and a
restart does not reset them. An agent that can edit its own settings can change them, so the wallet
should hold only what you accept losing. No tool sends funds to an address.

`npx -y @acta-markets/mcp --help` prints the same list. `npx -y @acta-markets/mcp keygen [file]`
writes a key yourself and prints only its address.

## Tools

`acta_status`, `acta_list_assets`, `acta_get_market`, `acta_list_vaults`, `acta_get_vault`,
`acta_list_vault_positions`, `acta_vault_deposit`, `acta_vault_withdraw`, `acta_vault_cancel_request`,
`acta_vault_process_request`,
`acta_preview_trade`, `acta_place_trade`, `acta_fund_position`, `acta_withdraw_funding`,
`acta_list_positions`, `acta_get_order`. What each does:
[docs.acta.markets/quickstart/mcp](https://docs.acta.markets/quickstart/mcp).

## From source

The tools live in `src/lib/agent/` of the
[repository](https://github.com/acta-markets/web-app), shared with the site's read-only `/mcp`
endpoint. This package is the stdio entry, the key generator and the on-disk journal.

```bash
npm install
npm run build:mcp                                               # writes packages/mcp/dist/cli.js
node packages/mcp/smoke.mjs                                     # list the tools over stdio
node packages/mcp/smoke.mjs acta_get_market '{"asset":"BTC"}'   # call one
```

`scripts/build-mcp.mjs` bundles the source into `dist/cli.js` and fails if the bundle imports a
package this `package.json` does not list.

## Licence

MIT
