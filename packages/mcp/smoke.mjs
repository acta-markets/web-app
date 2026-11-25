#!/usr/bin/env node
// Drives the built server the way an MCP client does, over stdio, and prints what comes back.
//
//   node packages/mcp/smoke.mjs                         list the tools
//   node packages/mcp/smoke.mjs acta_get_market '{"asset":"BTC"}'
//   node packages/mcp/smoke.mjs a '{}' b '{}'           several calls on one connection
//
// The server's environment is this process's: ACTA_KEYPAIR picks a key file, ACTA_STATE_DIR where
// it keeps the wallet it makes and its journal.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist/cli.js");
const args = process.argv.slice(2);
const calls = [];
for (let i = 0; i < args.length; i += 2) calls.push({ name: args[i], arguments: JSON.parse(args[i + 1] ?? "{}") });

const server = spawn(process.execPath, [cli], { stdio: ["pipe", "pipe", "inherit"] });
const waiting = new Map();
let buffer = "";
let nextId = 1;
server.stdout.on("data", (chunk) => {
  buffer += chunk;
  for (let end = buffer.indexOf("\n"); end !== -1; end = buffer.indexOf("\n")) {
    const line = buffer.slice(0, end).trim();
    buffer = buffer.slice(end + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  }
});
function request(method, params) {
  const id = nextId++;
  const answer = new Promise((resolve, reject) => {
    waiting.set(id, resolve);
    setTimeout(() => reject(new Error(`${method} got no answer in 150 s`)), 150_000).unref();
  });
  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return answer;
}

let failed = false;
try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "acta-smoke", version: "0" },
  });
  if (init.error) throw new Error(`initialize: ${JSON.stringify(init.error)}`);
  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  console.log(`# ${init.result.serverInfo.name} ${init.result.serverInfo.version}, protocol ${init.result.protocolVersion}`);

  if (calls.length === 0) {
    const { result, error } = await request("tools/list", {});
    if (error) throw new Error(`tools/list: ${JSON.stringify(error)}`);
    for (const tool of result.tools) {
      const hints = tool.annotations ?? {};
      const kind = hints.destructiveHint ? "moves funds" : hints.readOnlyHint ? "read" : "quote";
      console.log(`${tool.name.padEnd(22)} ${kind.padEnd(11)} ${Object.keys(tool.inputSchema?.properties ?? {}).join(", ")}`);
    }
  }
  for (const call of calls) {
    const started = Date.now();
    const { result, error } = await request("tools/call", call);
    console.log(`\n## ${call.name} ${JSON.stringify(call.arguments)}  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    if (error) {
      failed = true;
      console.log(`protocol error: ${JSON.stringify(error)}`);
      continue;
    }
    if (result.isError) failed = true;
    console.log(result.content.map((part) => part.text).join("\n"));
  }
} catch (error) {
  failed = true;
  console.error(error.message);
} finally {
  server.stdin.end();
  setTimeout(() => server.kill(), 3_000).unref();
}
server.on("exit", () => process.exit(failed ? 1 : 0));
