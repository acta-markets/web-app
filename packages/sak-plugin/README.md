# @acta-markets/solana-agent-kit-plugin

[Acta](https://devnet.acta.markets/agent) for [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit)
v2: read options markets and vaults, get live quotes from trading desks, place trades and fund bought
options. Devnet: test funds only.

```typescript
import { KeypairWallet, SolanaAgentKit } from "solana-agent-kit";
import createActaPlugin from "@acta-markets/solana-agent-kit-plugin";

const agent = new SolanaAgentKit(wallet, "https://api.devnet.solana.com", {}).use(
  createActaPlugin({ limits: { maxTradeUsd: 500, dailyUsd: 2000, allowedAssets: ["BTC", "ETH"] } }),
);
```

The actions are the MCP server's tools under the kit's naming (`ACTA_STATUS`, `ACTA_GET_MARKET`,
`ACTA_PLACE_TRADE` and so on) and work with the kit's LangChain, Vercel AI and OpenAI adapters. An
action returns `{ status: "success", result }` or `{ status: "error", error, message, next }`.

The kit's wallet signs. It must be able to sign a message (to sign in to the venue) and to sign a
transaction without sending it: the venue broadcasts a fill. The limits and the order journal are the
same as the MCP server's, and the plugin enforces them.

## Build and check

```bash
npm run build:sak                              # from the repository root
cd packages/sak-plugin && npm install          # the kit itself, kept out of the web app
ACTA_KEYPAIR=/path/to/wallet.json node smoke.mjs                         # list the actions
ACTA_KEYPAIR=/path/to/wallet.json node smoke.mjs ACTA_STATUS '{}'        # run one
```

The kit is on zod 3 and this repository's tool schemas are zod 4, so each action's schema is rebuilt
from the tool's JSON Schema. That is why every tool input is a flat object.

Not published. Tested against `solana-agent-kit` 2.0.10.
