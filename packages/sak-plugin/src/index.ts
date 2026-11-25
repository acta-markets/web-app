import os from "node:os";
import path from "node:path";
import { VersionedTransaction } from "@solana/web3.js";
import type { Action, Plugin, SolanaAgentKit } from "solana-agent-kit";
import * as z from "zod";
import * as z3 from "zod3";
import { TOOLS, type ToolSpec } from "@/lib/agent/catalog";
import { devnetConfig } from "@/lib/agent/config";
import { toAgentError } from "@/lib/agent/errors";
import { runTool } from "@/lib/agent/handlers";
import { DEFAULT_LIMITS, type Limits } from "@/lib/agent/limits";
import { ActaSession } from "@/lib/agent/session";
import { checkedSigner } from "@/lib/agent/signer";
import type { AgentContext } from "@/lib/agent/trade";
import { fileJournal } from "../../mcp/src/journal-file";

/**
 * Acta for Solana Agent Kit: the same tools the MCP server has, as kit actions. The kit's
 * wallet signs; the limits and the order journal are the same ones, enforced here.
 *
 * The kit is on zod 3 and this repository's tool schemas are zod 4. An action's schema is
 * therefore rebuilt from the tool's JSON Schema, which is why every tool input is a flat
 * object of strings, numbers, booleans and enums.
 */

export type ActaPluginOptions = {
  /** What the agent may do. Defaults: $2,500 a trade, $10,000 in 24 hours, every listed asset. */
  limits?: Partial<Limits>;
  /** Where the order journal is kept. Default `~/.acta-mcp`, shared with the MCP server. */
  stateDir?: string;
  /** Solana devnet RPC. Default: the public one. */
  rpcUrl?: string;
};

type JsonProperty = { type?: string; enum?: unknown[]; description?: string; minimum?: number; exclusiveMinimum?: number; minLength?: number; maxLength?: number };

/** One input field, in zod 3. Anything but a flat primitive is a mistake in the catalog, so it throws. */
function fieldSchema(tool: string, name: string, property: JsonProperty): z3.ZodTypeAny {
  let schema: z3.ZodTypeAny;
  if (property.type === "string" && Array.isArray(property.enum)) {
    schema = z3.enum(property.enum as [string, ...string[]]);
  } else if (property.type === "string") {
    let text = z3.string();
    if (property.minLength != null) text = text.min(property.minLength);
    if (property.maxLength != null) text = text.max(property.maxLength);
    schema = text;
  } else if (property.type === "number" || property.type === "integer") {
    let number = z3.number();
    if (property.exclusiveMinimum != null) number = number.gt(property.exclusiveMinimum);
    if (property.minimum != null) number = number.min(property.minimum);
    schema = number;
  } else if (property.type === "boolean") {
    schema = z3.boolean();
  } else {
    throw new Error(`${tool}.${name} is not a flat input and cannot be offered to Solana Agent Kit`);
  }
  return property.description ? schema.describe(property.description) : schema;
}

export function actionSchema(tool: ToolSpec): z3.ZodObject<z3.ZodRawShape> {
  const json = z.toJSONSchema(tool.input) as { properties?: Record<string, JsonProperty>; required?: string[] };
  const required = new Set(json.required ?? []);
  const shape: z3.ZodRawShape = {};
  for (const [name, property] of Object.entries(json.properties ?? {})) {
    const field = fieldSchema(tool.name, name, property);
    shape[name] = required.has(name) ? field : field.optional();
  }
  return z3.object(shape);
}

/** `acta_place_trade` as the kit names actions: ACTA_PLACE_TRADE. */
export const actionName = (tool: Pick<ToolSpec, "name">) => tool.name.toUpperCase();

function contextFor(agent: SolanaAgentKit, options: ActaPluginOptions): AgentContext {
  const wallet = agent.wallet;
  const signer = checkedSigner({
    address: wallet.publicKey.toBase58(),
    signMessage: (message: Uint8Array) => wallet.signMessage(message),
    // The kit's wallet signs transaction objects. It must only sign: the venue broadcasts a fill.
    signTransaction: async (wire: Uint8Array) => (await wallet.signTransaction(VersionedTransaction.deserialize(wire))).serialize(),
  });
  const config = devnetConfig({ rpcUrl: options.rpcUrl, clientName: "acta-sak-plugin", clientVersion: "0.1.0" });
  return {
    session: new ActaSession(config, signer),
    limits: { ...DEFAULT_LIMITS, ...options.limits },
    journal: fileJournal(options.stateDir ?? path.join(os.homedir(), ".acta-mcp"), config.network),
    placing: false,
  };
}

/**
 * The plugin: `agent.use(createActaPlugin())`. Devnet only. Nothing connects until an action
 * runs, and one venue session is kept per agent.
 */
export function createActaPlugin(options: ActaPluginOptions = {}): Plugin & { close(agent: SolanaAgentKit): void } {
  const contexts = new WeakMap<SolanaAgentKit, AgentContext>();
  const context = (agent: SolanaAgentKit) => {
    let ctx = contexts.get(agent);
    if (!ctx) {
      ctx = contextFor(agent, options);
      contexts.set(agent, ctx);
    }
    return ctx;
  };

  const actions: Action[] = TOOLS.map((tool) => ({
    name: actionName(tool),
    similes: [tool.title.toLowerCase(), tool.name.replace(/^acta_/, "").replace(/_/g, " ")],
    description: tool.description,
    examples: [],
    schema: actionSchema(tool),
    handler: async (agent, input) => {
      try {
        // The kit may hand over unchecked input: it is checked against the tool's own schema here.
        const result = await runTool(context(agent), tool, tool.input.parse(input ?? {}));
        // Under its own key: a trade's result has a `status` of its own (confirmed, limit_not_met, unknown).
        return { status: "success", result };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return { status: "error", error: "invalid_input", message: z.prettifyError(error), next: "fix_request" };
        }
        const { code, message, action, details } = toAgentError(error);
        return { status: "error", error: code, message, next: action, ...(details ? { details } : {}) };
      }
    },
  }));

  return {
    name: "acta",
    methods: {},
    actions,
    initialize() {},
    /** Closes the agent's venue session, so a script can exit. */
    close(agent) {
      contexts.get(agent)?.session.close();
      contexts.delete(agent);
    },
  };
}

export default createActaPlugin;
