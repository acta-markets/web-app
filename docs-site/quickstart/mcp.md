# MCP server for agents

How an AI agent uses Acta through MCP (Model Context Protocol), without writing a client. There are
two servers. One is hosted on the site and only reads. The other runs on your machine with its own
wallet and trades.

Both are on devnet. Every balance is test funds.

To write your own client against the protocol, see [Agents and automation](agents.md).

## The quick way: let the agent connect itself

Paste this to an agent that can run commands (Claude Code, Cursor, Codex). It adds the server to
itself and reports the wallet it made. The [Agent page](https://devnet.acta.markets/agent) lists the
one step for each tool instead: Claude, ChatGPT, Codex, Cursor, Hermes, OpenClaw, VS Code, Gemini CLI
and more, with a button where the tool has an install link.

```text
Connect yourself to Acta, an options venue on Solana.

1. Add an MCP server to yourself under the name "acta", for every project, replacing any server already called that. It needs Node 22 or later:
   command: npx
   arguments: -y @acta-markets/mcp
2. If the acta tools are not there until you are restarted, tell me to restart you and stop.
3. Call acta_status and tell me the wallet's address, what it holds and its limits.

The server needs no key and no settings. On its first call it makes its own wallet in ~/.acta-mcp.
Do not place a trade until I ask for one. Never open or print the key file.
The full guide is https://devnet.acta.markets/agent
```

Most agents see a new server's tools only after a restart.

## The trade in one sentence

Every tool speaks the sentence the Trade page uses: "I believe [asset] will be [above|below] [strike]
on [expiry]."

| side | view | Option | Deposit | If right | If wrong |
|---|---|---|---|---|---|
| sell | above | Cash-secured put | strike x size, in the quote token | Deposit returns, premium kept | Deposit buys the asset at the strike |
| sell | below | Covered call | size, in the asset | Deposit returns, premium kept | Asset is sold at the strike |
| buy | above | Call | none, the premium is paid | May buy at the strike once funded | Premium is lost |
| buy | below | Put | none, the premium is paid | May sell at the strike once funded | Premium is lost |

Amounts are whole tokens and dollars (`0.1` is 0.1 BTC), never atomic units.

## Read only: the hosted server

```text
https://devnet.acta.markets/mcp
```

Streamable HTTP, stateless, no sign-in. Add it to an MCP client as a remote server. It serves the
tools that need no wallet, holds no key and cannot trade. Answers are cached for 15 seconds, and a
caller is limited to 120 requests a minute.

Its server card is at `/mcp/server-card` and the site's AI catalog at `/.well-known/ai-catalog.json`.
Both formats are still experimental upstream.

## Trade: the server on your machine

The server is [`@acta-markets/mcp`](https://www.npmjs.com/package/@acta-markets/mcp) on npm, a Node
program (Node 22 or later) that speaks MCP over stdio. The first time a tool is called it makes its
own devnet wallet in `~/.acta-mcp/wallet.json` and uses it from then on. It signs in to the venue with
that key, and it is the only thing that ever holds it. It serves the read tools too, so it takes the
place of the hosted server.

Add it to your agent:

```bash
claude mcp add --scope user acta -- npx -y @acta-markets/mcp   # Claude Code
codex mcp add acta -- npx -y @acta-markets/mcp                 # Codex
```

For a client that reads servers from a file:

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

A desktop app starts the server with the system's short `PATH`, not your shell's, so a Node installed
by a version manager may not be found (`spawn npx ENOENT`). Put the full path in `command` instead:
`which npx` prints it.

On devnet the venue funds a new wallet with test assets the first time it signs in. Ask the agent
for `acta_status` to see the address and the balances.

To use a key you already have, set `ACTA_KEYPAIR` to its file (a JSON array, as `solana-keygen`
writes it). `npx -y @acta-markets/mcp keygen [file]` writes a new one and prints only its address.

To build the server from source instead, see the package's
[README](https://github.com/acta-markets/web-app/tree/devnet/packages/mcp).

## Tools

| Tool | What it can do | Needs the wallet |
|---|---|---|
| `acta_status` | Reads the network, the venue's health, the wallet's balances and the limits left | no |
| `acta_list_assets` | Reads the assets on offer and the indicative yield of selling each side | no |
| `acta_get_market` | Reads one asset's price, tradable dates and strikes with indicative premiums | no |
| `acta_list_vaults` | Reads the vaults: what each takes, its size and past returns | no |
| `acta_get_vault` | Reads one vault: whether it takes deposits now, its room, fees, what it holds and recent cycles | no |
| `acta_list_vault_positions` | Reads what the wallet holds in vaults: shares, their value and pending requests | yes |
| `acta_vault_deposit` | Moves funds: requests a deposit into a vault | yes |
| `acta_vault_withdraw` | Moves funds: requests a withdrawal of shares | yes |
| `acta_vault_cancel_request` | Moves funds: takes back a pending deposit or withdrawal request | yes |
| `acta_vault_process_request` | Moves funds: processes the wallet's own request once the vault has left it past its delay | yes |
| `acta_preview_trade` | Asks the desks for a live quote; trades nothing | yes |
| `acta_place_trade` | Places a trade at a limit or better. Moves the wallet's funds | yes |
| `acta_fund_position` | Pays in what exercising a bought option costs. Moves the wallet's funds | yes |
| `acta_withdraw_funding` | Takes that funding back before expiry. Moves the wallet's funds | yes |
| `acta_list_positions` | Reads the wallet's positions | yes |
| `acta_get_order` | Reads where one order stands | yes |

Covered calls and cash-secured puts, sold or bought, are supported, and so is funding a bought
option. Vaults are served in full: reading them, depositing, withdrawing, and cancelling or processing
a request. A deposit or a withdrawal is a request the vault processes between cycles. Spreads and cash
puts are not served by these tools yet; use the app for those.

A bought option pays out only if it is funded before expiry: the strike's worth of the quote token
for a call, the asset for a put. If it then ends out of the money, what was paid in comes back.
Funding is a transaction the wallet pays for itself, so the wallet needs a little SOL.

## Placing a trade

A quote lives for seconds, less than the time between two tool calls, so there is no quote to carry
from one call to the next. `acta_place_trade` takes the trade and `limit_premium` and does the rest in
one call: it asks for fresh quotes, takes the best one only if it meets the limit, checks and signs the
sponsored transaction, submits it once and waits for confirmation.

`limit_premium` is in the quote token for the whole trade: the least to receive when selling, the most
to pay when buying. `acta_preview_trade` returns a `limit_premium_hint`. With `dry_run: true` the call
checks the owner's limits, quotes and trades nothing. A dry run and a preview refuse what the real call
would refuse for a limit.

| `status` | Meaning |
|---|---|
| `confirmed` | Filled. The result carries the position and the transaction |
| `dry_run` | The limit was met; nothing was traded |
| `limit_not_met` | The best quote was worse than the limit; nothing was traded |
| `unknown` | Sent, and the result has not arrived. Never place it again: call `acta_get_order` |

Once the signed transaction has been sent, the server says "nothing was traded" only when the venue
reports that the order itself failed. The request for quotes closing or reopening is not that: the
order is then `unknown`. `acta_get_order` settles it: the venue is asked, and an order too old to still
land is looked for on chain and among the wallet's positions before it is closed as not executed.
Until an order is settled the server places no other trade.

An error carries `next`: `fix_request`, `retry`, `reconcile` or `stop`.

## What the server checks before it signs

The venue sends the transaction to sign. The server signs it only if it opens exactly the accepted
quote on the requested terms, is paid by the venue's keeper as read from chain, and stays inside a
fixed compute budget. Otherwise it signs nothing and reports `fill_not_signed`.

## Another signer

A key file is the simplest signer and the least protected. To sign with a KMS, a custody service or
a hardware key instead, set `ACTA_SIGNER_MODULE` to the path of an ES module in place of
`ACTA_KEYPAIR`. Its default export is a function that returns:

```typescript
{
  address: string;                                             // base58
  signMessage(message: Uint8Array): Promise<Uint8Array>;       // 64-byte ed25519 signature
  signTransaction?(wire: Uint8Array): Promise<Uint8Array>;     // the signed transaction, message unchanged
}
```

`signMessage` signs the sign-in challenge, so a signer that cannot sign a message cannot be used.
With `signTransaction` present, fills and funding are signed as whole transactions and the signer is
never asked for a raw signature over transaction bytes. A signer that broadcasts by itself, or that
rewrites a transaction before signing, does not fit: the venue broadcasts a fill, and a fill must be
signed exactly as served.

The server verifies every message signature against the address before using it, and the SDK verifies
a signed fill against the accepted quote. The module runs with the server's rights; it is yours to
write and to trust. This path is tested with a transaction-only signer over a local key. It has not
been run against each custody provider.

## Solana Agent Kit

The same tools are available as a [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit)
v2 plugin, `packages/sak-plugin` in the repository. Its actions carry the kit's naming
(`ACTA_GET_MARKET`, `ACTA_PLACE_TRADE`) and the kit's wallet signs. The limits and the journal are the
same.

## Limits

Set in the server's environment by whoever runs it. The server enforces them; an agent cannot change
them.

| Variable | Meaning | Default |
|---|---|---|
| `ACTA_MAX_TRADE_USD` | Largest strike x size of one trade or one option funding, or dollar value of one vault deposit | 2500 |
| `ACTA_DAILY_LIMIT_USD` | Most strike x size, option funding and vault deposits in any 24 hours | 10000 |
| `ACTA_ALLOWED_ASSETS` | The only assets it may trade, comma separated | every listed asset |
| `ACTA_READ_ONLY` | `1`: never trade or fund | off |
| `ACTA_RPC_URL` | Solana devnet RPC | the public one |
| `ACTA_STATE_DIR` | Where the order journal is kept | `~/.acta-mcp` |

The journal is a file of one line per change. It is what keeps the day's total across restarts,
and what stops an order that was signed before a crash from being signed again: on the next trade the
server first looks every unsettled order up at the venue.

Everything that takes funds out of the wallet is counted: a trade, funding a bought option and a vault
deposit. Each is checked against the limits and written in the journal in one step, under a lock, right
before it is sent. Calls made at the same time, or by two servers on the same wallet, are counted one
after the other and cannot each pass alone. A deposit or a funding that is taken back stops counting.

The limits are a ceiling. An agent may fill them, so set them to what you accept losing, not to what
you expect it to trade.

No tool sends funds to an address.

## Related

- [Agents and automation](agents.md)
- [Taker quickstart](taker-quickstart.md)
- [Endpoints and maker registration](../reference/sandbox.md)
