// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TOOL_LIST } from "./tools";
import {
  agentPrompt,
  buildSteps,
  agentProviders,
  agentTools,
  hostedMcpUrl,
  LIMIT_SETTINGS,
  localConfig,
  MCP_PACKAGE,
  MCP_PUBLISHED,
  MCP_SERVER_NAME,
} from "./install";

const SITE = "https://devnet.acta.markets";
const tools = agentTools(SITE);
const tool = (id: string) => tools.find((t) => t.id === id)!;

describe("the prompt a person pastes to their agent", () => {
  const prompt = agentPrompt(SITE);

  it("says what this is before it asks for anything, and names no environment", () => {
    // Which network it is comes from the server (acta_status says so), not from a line of copy.
    expect(prompt.split("\n")[0]).toBe("Connect yourself to Acta, an options venue on Solana.");
    // The site's own address may carry a network name; the words around it must not.
    expect(prompt.replace(/https?:\/\/\S+/g, "")).not.toMatch(/devnet|mainnet|test funds/i);
  });

  it("leaves nothing for the person to fill in", () => {
    expect(prompt).not.toMatch(/\/absolute\/path|\/path\/to|<[^>]+>|YOUR_|ACTA_KEYPAIR/);
  });

  it("numbers its steps from one, with none skipped", () => {
    const numbers = [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(numbers.length).toBeGreaterThanOrEqual(3);
  });

  it("ends in a status, holds the agent back from trading and keeps the key closed", () => {
    expect(prompt).toContain("acta_status");
    expect(prompt).toContain("Do not place a trade until I ask for one.");
    expect(prompt).toContain("Never open or print the key file.");
    expect(prompt).toContain(`${SITE}/agent`);
  });

  it("gets the server the way the page does", () => {
    if (MCP_PUBLISHED) expect(prompt).toContain(`-y ${MCP_PACKAGE}`);
    else expect(prompt).toContain(buildSteps()[0]);
  });

  it("is written in the site's punctuation", () => {
    expect(prompt).not.toMatch(/[–—]/);
  });
});

describe("adding the server to each tool", () => {
  const setups = tools.flatMap((t) => [t.trade, t.read].flatMap((setup) => (setup ? [{ tool: t.name, setup }] : [])));

  it("lists each tool once", () => {
    const ids = tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("claude-code");
    expect(ids.length).toBe(25);
  });

  it("shows ten buttons: nine makers, then everything else", () => {
    const providers = agentProviders(SITE);
    expect(providers.map((p) => p.name)).toEqual([
      "Claude",
      "OpenAI",
      "Cursor",
      "GitHub Copilot",
      "Gemini",
      "DeepSeek",
      "GLM (Z.ai)",
      "Hermes",
      "OpenClaw",
      "Other agents",
    ]);
    // every tool sits under exactly one button, and no button is empty
    expect(providers.flatMap((p) => p.apps.map((app) => app.id))).toEqual(tools.map((t) => t.id));
    for (const p of providers) expect(p.apps.length, p.name).toBeGreaterThan(0);
    // the catch-all opens on the prompt any agent can follow
    expect(providers.at(-1)!.apps[0].id).toBe("other");
  });

  it("gives every tool one step that says what to do and has something to click or copy", () => {
    for (const t of tools) expect(t.trade ?? t.read, t.name).toBeTruthy();
    for (const { tool: name, setup } of setups) {
      expect(setup.title.length, name).toBeGreaterThan(8);
      expect(setup.link ?? setup.block, name).toBeTruthy();
      for (const text of [setup.title, setup.note ?? "", setup.block?.label ?? ""]) expect(text, name).not.toMatch(/[–—]|\.$/);
    }
  });

  it("points every read step at the site's endpoint and every trade step at the package", () => {
    for (const t of tools) {
      if (t.read) expect(decodeURIComponent(`${t.read.link?.href ?? ""} ${t.read.block?.text ?? ""}`), t.name).toContain(`${SITE}/mcp`);
      if (t.trade && MCP_PUBLISHED) {
        const text = decodeURIComponent(`${t.trade.link?.href ?? ""} ${t.trade.block?.text ?? ""}`);
        expect(text.includes(MCP_PACKAGE) || text.includes("eyJ"), t.name).toBe(true);
      }
    }
  });

  it("leaves nothing to fill in once the server is on npm, and never links to a path that is", () => {
    for (const { tool: name, setup } of setups) {
      const everything = decodeURIComponent(`${setup.link?.href ?? ""} ${setup.block?.text ?? ""}`);
      if (MCP_PUBLISHED) expect(everything, name).not.toMatch(/\/absolute\/path|\$PWD/);
      if (setup.link) expect(decodeURIComponent(setup.link.href), name).not.toMatch(/\/absolute\/path|\$PWD/);
      expect(everything, name).not.toContain("ACTA_KEYPAIR");
    }
  });

  it("offers trading only where a server can run on the machine", () => {
    expect(tools.filter((t) => !t.trade).map((t) => t.id)).toEqual(["claude", "chatgpt"]);
  });

  it("has a mark for every button, and no mark that no button draws", async () => {
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir("public/images/agent-tools")).sort();
    expect(agentProviders(SITE).map((p) => p.icon).sort()).toEqual(files);
  });

  it("writes Cursor's link as the server's entry in base64", () => {
    const url = new URL(tool("cursor").read!.link!.href);
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe("cursor://anysphere.cursor-deeplink/mcp/install");
    expect(url.searchParams.get("name")).toBe(MCP_SERVER_NAME);
    expect(JSON.parse(atob(url.searchParams.get("config")!))).toEqual({ url: hostedMcpUrl(SITE) });
  });

  it("writes VS Code's link as the named entry, URL-encoded", () => {
    const href = tool("vscode").read!.link!.href;
    expect(href.startsWith("vscode:mcp/install?")).toBe(true);
    expect(JSON.parse(decodeURIComponent(href.slice("vscode:mcp/install?".length)))).toEqual({
      name: MCP_SERVER_NAME,
      type: "http",
      url: hostedMcpUrl(SITE),
    });
  });

  it("writes Claude's link so the connector dialog opens filled in", () => {
    const url = new URL(tool("claude").read!.link!.href);
    expect(`${url.origin}${url.pathname}`).toBe("https://claude.ai/customize/connectors");
    expect(Object.fromEntries(url.searchParams)).toEqual({ modal: "add-custom-connector", connectorName: "Acta", connectorUrl: hostedMcpUrl(SITE) });
  });

  it("writes Goose's link with each argument on its own and nothing left as a plus sign", () => {
    const read = new URL(tool("goose").read!.link!.href);
    expect(read.protocol).toBe("goose:");
    expect(read.searchParams.get("url")).toBe(hostedMcpUrl(SITE));
    expect(read.searchParams.get("type")).toBe("streamable_http");
    expect(tool("goose").read!.link!.href).not.toContain("+");
    if (MCP_PUBLISHED) {
      const trade = new URL(tool("goose").trade!.link!.href);
      expect(trade.searchParams.get("cmd")).toBe("npx");
      expect(trade.searchParams.getAll("arg")).toEqual(["-y", MCP_PACKAGE]);
    }
  });

  it("gives the commands that were run here, word for word", () => {
    if (!MCP_PUBLISHED) return;
    expect(tool("claude-code").trade!.block!.text).toBe(`claude mcp add --scope user acta -- npx -y ${MCP_PACKAGE}`);
    expect(tool("claude-code").read!.block!.text).toBe(`claude mcp add --scope user --transport http acta ${SITE}/mcp`);
    expect(tool("hermes").trade!.block!.text).toBe(`hermes mcp add acta --command npx --args -y ${MCP_PACKAGE}`);
    expect(tool("hermes").read!.block!.text).toBe(`hermes mcp add acta --url ${SITE}/mcp`);
    expect(tool("gemini-cli").trade!.block!.text).toBe(`gemini mcp add -s user acta npx -y ${MCP_PACKAGE}`);
    expect(tool("gemini-cli").read!.block!.text).toBe(`gemini mcp add -s user --transport http acta ${SITE}/mcp`);
  });

  it("writes DeepSeek Harness's entry as its MCP client plugin, in the patch file's shape", () => {
    const trade = tool("deepseek-harness").trade!.block!;
    expect(trade.label).toBe("~/.dsh/cordis.patch.yml");
    expect(trade.text.split("\n").slice(0, 5)).toEqual([
      "- insert:",
      "    - id: acta-mcp",
      "      name: '@deepseek-ai/dsh-mcp-client'",
      "      config:",
      "        serverName: acta",
    ]);
    if (MCP_PUBLISHED) expect(trade.text).toContain(`        args: ["-y","${MCP_PACKAGE}"]`);
    expect(tool("deepseek-harness").read!.block!.text).toContain(`        transport: streamable-http\n        url: ${SITE}/mcp`);
    // The desktop app starts servers without the shell's PATH: the step that runs npx says what to do then.
    expect(tool("deepseek-harness").trade!.note).toMatch(/Node 22 or later/);
    expect(tool("deepseek-harness").trade!.note).toMatch(/which npx/);
    // npx starts node by name, so the full path of npx is not enough: node's folder goes on PATH too.
    expect(tool("deepseek-harness").trade!.note).toMatch(/env: \{ PATH: /);
    expect(tool("deepseek-harness").read!.note).not.toMatch(/npx/);
  });

  it("writes ZCode's entry the way its settings screen takes one", () => {
    expect(tool("zcode").read!.block!.label).toBe("Settings > MCP Servers > New > JSON");
    expect(JSON.parse(tool("zcode").read!.block!.text)).toEqual({ mcpServers: { acta: { type: "http", url: `${SITE}/mcp` } } });
    if (MCP_PUBLISHED) {
      expect(JSON.parse(tool("zcode").trade!.block!.text)).toEqual({ mcpServers: { acta: { command: "npx", args: ["-y", MCP_PACKAGE] } } });
    }
  });

  it("hands every other agent the prompt", () => {
    expect(tool("other").trade!.block).toEqual({ label: "Prompt", text: agentPrompt(SITE), wrap: true });
  });
});

describe("the limits the page shows", () => {
  it("shows each default as the figure the server really uses", async () => {
    const { DEFAULT_LIMITS } = await import("./limits");
    const shown = Object.fromEntries(LIMIT_SETTINGS.map((setting) => [setting.name, setting.shown]));
    expect(shown.ACTA_MAX_TRADE_USD).toBe(`$${DEFAULT_LIMITS.maxTradeUsd.toLocaleString("en-US")}`);
    expect(shown.ACTA_DAILY_LIMIT_USD).toBe(`$${DEFAULT_LIMITS.dailyUsd.toLocaleString("en-US")}`);
    expect(LIMIT_SETTINGS.find((s) => s.name === "ACTA_MAX_TRADE_USD")!.fallback).toBe(String(DEFAULT_LIMITS.maxTradeUsd));
    expect(DEFAULT_LIMITS.readOnly).toBe(false);
    expect(DEFAULT_LIMITS.allowedAssets).toBeNull();
  });
});

describe("a config entry", () => {
  it("keeps a list of arguments on one line and is still the same JSON", () => {
    const text = tool("cursor").trade!.block!.text;
    if (MCP_PUBLISHED) expect(text).toContain(`"args": ["-y", "${MCP_PACKAGE}"]`);
    expect(JSON.parse(text)).toEqual({ mcpServers: { acta: MCP_PUBLISHED ? { command: "npx", args: ["-y", MCP_PACKAGE] } : expect.anything() } });
  });
});

describe("the docs", () => {
  it("give the same prompt as the page", async () => {
    const { readFile } = await import("node:fs/promises");
    const guide = await readFile("docs-site/quickstart/mcp.md", "utf8");
    expect(guide).toContain(agentPrompt(SITE));
  });
});

describe("the package's page on npm", () => {
  it("names every tool and every limit, and how to run the published package", async () => {
    const { readFile } = await import("node:fs/promises");
    const readme = await readFile("packages/mcp/README.md", "utf8");
    for (const tool of TOOL_LIST) expect(readme, tool.name).toContain(`\`${tool.name}\``);
    for (const setting of LIMIT_SETTINGS) expect(readme, setting.name).toContain(`\`${setting.name}\` | ${setting.meaning} | ${setting.fallback}`);
    expect(readme).toContain(`npx -y ${MCP_PACKAGE}`);
    const manifest = JSON.parse(await readFile("packages/mcp/package.json", "utf8"));
    expect(manifest.name).toBe(MCP_PACKAGE);
    expect(manifest.private).toBeUndefined();
    expect(manifest.license).toBe("MIT");
  });
});
