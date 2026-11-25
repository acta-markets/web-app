#!/usr/bin/env node
// Runs the built plugin inside a real Solana Agent Kit agent, on devnet.
//
//   ACTA_KEYPAIR=/path/to/wallet.json node packages/sak-plugin/smoke.mjs
//   ... smoke.mjs ACTA_GET_MARKET '{"asset":"BTC"}'
import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import { KeypairWallet, SolanaAgentKit } from "solana-agent-kit";
import createActaPlugin from "./dist/index.js";

const RPC = process.env.ACTA_RPC_URL || "https://api.devnet.solana.com";
const keyPath = process.env.ACTA_KEYPAIR;
if (!keyPath) {
  console.error("Set ACTA_KEYPAIR to a key file");
  process.exit(1);
}
const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8"))));
const plugin = createActaPlugin(process.env.ACTA_STATE_DIR ? { stateDir: process.env.ACTA_STATE_DIR } : {});
const agent = new SolanaAgentKit(new KeypairWallet(keypair, RPC), RPC, {}).use(plugin);

const args = process.argv.slice(2);
let failed = false;
try {
  if (args.length === 0) {
    for (const action of agent.actions) {
      console.log(`${action.name.padEnd(24)} ${Object.keys(action.schema.shape ?? {}).join(", ")}`);
    }
  }
  for (let i = 0; i < args.length; i += 2) {
    const action = agent.actions.find((a) => a.name === args[i]);
    if (!action) throw new Error(`No action ${args[i]}`);
    const input = JSON.parse(args[i + 1] ?? "{}");
    const started = Date.now();
    // as the kit's adapters do: parse with the action's own schema, then run the handler
    const result = await action.handler(agent, action.schema.parse(input));
    if (result.status !== "success") failed = true;
    console.log(`\n## ${action.name} ${JSON.stringify(input)}  (${((Date.now() - started) / 1000).toFixed(1)} s)\n${JSON.stringify(result)}`);
  }
} catch (error) {
  failed = true;
  console.error(error.message);
} finally {
  plugin.close(agent);
}
process.exit(failed ? 1 : 0);
