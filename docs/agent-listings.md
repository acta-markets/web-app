# Listing Acta for agents

Copy for the directories solana.ai points to. Nothing here has been submitted. Each needs the
package published first, and each directory's own contribution rules read before the PR: the entry
formats below are the text, not a checked template.

## Before any listing

1. Done 2026-11-25: `@acta-markets/mcp@0.1.0` is on npm and `MCP_PUBLISHED` is true. A later version
   is `cd packages/mcp`, bump `version`, `npm publish` (it rebuilds first; needs 2FA).
2. Deploy, and check `https://devnet.acta.markets/mcp` and `/mcp/server-card` answer.

## Official MCP registry (registry.modelcontextprotocol.io)

Published with the `mcp-publisher` CLI, not by PR. Name `markets.acta/acta`, which needs the
`acta.markets` domain verified. Two entries in one `server.json`: the npm package (stdio) and the
remote `https://devnet.acta.markets/mcp` (streamable-http).

> Options and curated yield vaults on Solana. Read markets, get live quotes from trading desks and
> place trades with its own wallet and your limits. Devnet.

## awesome-solana-ai (solana-foundation/awesome-solana-ai)

MCP servers section:

> **Acta** - Options and yield vaults on Solana over MCP: markets, live RFQ quotes, trades at a limit,
> funding. Runs locally with its own wallet; a hosted read-only endpoint needs none. Devnet.
> https://devnet.acta.markets/agent

AI coding skills, DeFi section:

> **trade-on-acta** - Sell options for premium or buy calls and puts on Acta through its MCP tools:
> the one-sentence trade, limits, and what to do when a result is unknown.
> https://devnet.acta.markets/.well-known/agent-skills/trade-on-acta/SKILL.md

## Solana Agent Kit

`packages/sak-plugin`, tested against `solana-agent-kit` 2.0.10. Publish as
`@acta-markets/solana-agent-kit-plugin` once the MCP package is out. SendAI documents no listing
process for third-party plugins.

## Not done

- skills.sh: how it indexes a skill that lives under `public/.well-known/` was not checked.
- The Solana docs MCP (`mcp.solana.com`) takes documentation sources, not protocol tools. Whether it
  accepts a PR adding `docs.acta.markets` was not confirmed.
