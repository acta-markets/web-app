import { generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { getBase58Decoder } from "@solana/kit";
import { devnetConfig, requireDevnet } from "@/lib/agent/config";
import { DEFAULT_LIMITS, type Limits } from "@/lib/agent/limits";
import { buildMcpServer } from "@/lib/agent/mcp";
import { ActaSession } from "@/lib/agent/session";
import { checkedSigner, keypairSigner, parseKeyFile, type ActaSigner } from "@/lib/agent/signer";
import type { AgentContext } from "@/lib/agent/trade";
import { fileJournal } from "./journal-file";

declare const __ACTA_MCP_VERSION__: string;
const VERSION = typeof __ACTA_MCP_VERSION__ === "string" ? __ACTA_MCP_VERSION__ : "0.0.0-dev";

// stdout carries the protocol. Anything a dependency prints goes to stderr instead.
console.log = (...args: unknown[]) => console.error(...args);
console.info = console.log;
console.debug = console.log;

const HELP = `acta-mcp ${VERSION}: Acta for agents, over MCP (stdio). Devnet: test funds only.

  acta-mcp                 serve. The first tool call makes a devnet wallet if there is none yet
                           (~/.acta-mcp/wallet.json) and uses it from then on.
  acta-mcp keygen [file]   write a new key (default ~/.acta-mcp/wallet.json) and print its address

Environment
  ACTA_KEYPAIR             path to a key file to use instead (a JSON array, as solana-keygen writes it)
  ACTA_SIGNER_MODULE       instead of a key file: path to an ES module whose default export returns
                           { address, signMessage(bytes), signTransaction?(wire) }, for a KMS or custody signer
  ACTA_MAX_TRADE_USD       largest strike x size of one trade, or dollar value of one vault deposit (default ${DEFAULT_LIMITS.maxTradeUsd})
  ACTA_DAILY_LIMIT_USD     most strike x size and vault deposits in any 24 hours (default ${DEFAULT_LIMITS.dailyUsd})
  ACTA_ALLOWED_ASSETS      comma-separated symbols the agent may trade (default: all listed)
  ACTA_READ_ONLY           1: never trade, whatever is asked
  ACTA_RPC_URL             Solana devnet RPC                           (default: the public one)
  ACTA_STATE_DIR           where the order journal is kept             (default ~/.acta-mcp)
`;

function stateDir(): string {
  return process.env.ACTA_STATE_DIR?.trim() || path.join(os.homedir(), ".acta-mcp");
}

function positive(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a number, zero or more`);
  return value;
}

function limitsFromEnv(): Limits {
  const assets = process.env.ACTA_ALLOWED_ASSETS?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return {
    readOnly: ["1", "true", "yes"].includes((process.env.ACTA_READ_ONLY ?? "").trim().toLowerCase()),
    maxTradeUsd: positive("ACTA_MAX_TRADE_USD", DEFAULT_LIMITS.maxTradeUsd),
    dailyUsd: positive("ACTA_DAILY_LIMIT_USD", DEFAULT_LIMITS.dailyUsd),
    allowedAssets: assets?.length ? assets : null,
  };
}

/** Where the server keeps its own key when it is not given one. */
const defaultKeyFile = () => path.join(stateDir(), "wallet.json");

/** Writes a new key to `file`, never over an existing one, readable by its owner only. Returns the address. */
async function writeNewKey(file: string): Promise<string> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = Buffer.from(privateKey.export({ format: "jwk" }).d ?? "", "base64url");
  const pub = Buffer.from(publicKey.export({ format: "jwk" }).x ?? "", "base64url");
  if (seed.length !== 32 || pub.length !== 32) throw new Error("Could not generate a key on this machine");
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify([...seed, ...pub]), { flag: "wx", mode: 0o600 });
  return getBase58Decoder().decode(pub);
}

async function keygen(target: string | undefined): Promise<void> {
  const file = path.resolve(target ?? defaultKeyFile());
  const address = await writeNewKey(file).catch((error: NodeJS.ErrnoException) => {
    throw error.code === "EEXIST" ? new Error(`${file} already exists; it was left as it is`) : error;
  });
  // The address only. The key itself is never printed.
  process.stdout.write(`${address}\n`);
  console.error(`Key written to ${file}`);
}

const readKey = async (file: string) => keypairSigner(parseKeyFile(await readFile(file, "utf8")));

/**
 * The server's own wallet: the key in its state directory, made the first time it is needed.
 * Devnet only (`serve` refuses anything else), so what a new key holds is test funds the venue
 * hands out. Two processes starting at once both end up on the one file: `wx` lets only one write.
 */
async function ownSigner(): Promise<ActaSigner> {
  const file = defaultKeyFile();
  const missing = (error: NodeJS.ErrnoException) => error.code === "ENOENT";
  try {
    return await readKey(file);
  } catch (error) {
    if (!missing(error as NodeJS.ErrnoException)) throw error;
  }
  const address = await writeNewKey(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") return null;
    throw error;
  });
  if (address) console.error(`acta-mcp: made a devnet wallet ${address}, key in ${file}`);
  return readKey(file);
}

/**
 * A signer the owner supplies as code: the bridge to a KMS, a custody API or a hardware key.
 * The module runs with this process's rights, so it is the owner's to write and to trust.
 */
async function moduleSigner(file: string): Promise<ActaSigner> {
  const loaded: { default?: unknown } = await import(pathToFileURL(path.resolve(file)).href);
  if (typeof loaded.default !== "function") throw new Error("ACTA_SIGNER_MODULE must default-export a function that returns a signer");
  return checkedSigner(await (loaded.default as () => unknown)());
}

async function serve(): Promise<void> {
  requireDevnet(process.env.ACTA_NETWORK);
  const keyPath = process.env.ACTA_KEYPAIR?.trim();
  const signerModule = process.env.ACTA_SIGNER_MODULE?.trim();
  if (keyPath && signerModule) throw new Error("Set ACTA_KEYPAIR or ACTA_SIGNER_MODULE, not both");
  const limits = limitsFromEnv();
  const config = devnetConfig({ rpcUrl: process.env.ACTA_RPC_URL?.trim(), clientVersion: VERSION });

  // Built on the first tool call: a client may start this process only to list the tools, and
  // that must read or make no key, sign nothing and open no socket.
  let context: Promise<AgentContext> | null = null;
  const getContext = () => {
    context ??= (async () => {
      const signer = keyPath ? await readKey(path.resolve(keyPath)) : signerModule ? await moduleSigner(signerModule) : await ownSigner();
      return {
        session: new ActaSession(config, signer),
        limits,
        journal: fileJournal(stateDir(), config.network),
        placing: false,
      };
    })();
    context.catch(() => {
      context = null;
    });
    return context;
  };

  serveStdio(() => buildMcpServer(getContext, "local", { name: "acta", version: VERSION }), {
    onerror: (error) => console.error(`acta-mcp: ${error.message}`),
  });
  const shutdown = () => {
    void context?.then((ctx) => ctx.session.close()).catch(() => {}).finally(() => process.exit(0));
    if (!context) process.exit(0);
  };
  process.stdin.on("close", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const [command, argument] = process.argv.slice(2);
const run = command === "keygen" ? keygen(argument)
  : command === "--help" || command === "-h" || command === "help" ? Promise.resolve(void process.stdout.write(HELP))
  : command === "--version" ? Promise.resolve(void process.stdout.write(`${VERSION}\n`))
  : command ? Promise.reject(new Error(`Unknown command "${command}". Try acta-mcp --help`))
  : serve();
run.catch((error: unknown) => {
  console.error(`acta-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
