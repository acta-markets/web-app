/**
 * How a person points an agent at Acta. One place, so the `/agent` page, its markdown, the
 * skill and the docs all give the same prompt, links and commands.
 *
 * `MCP_PUBLISHED` says whether `@acta-markets/mcp` is on npm (it is, since 0.1.0). False turns
 * every instruction back to building the server from this repository, for a fork or a branch
 * whose server is ahead of the published one.
 */
export const MCP_PACKAGE = "@acta-markets/mcp";
export const MCP_PUBLISHED = true;
export const MCP_REPO = "https://github.com/acta-markets/web-app";
/** The branch the server is built from while it is not on npm. */
export const MCP_BRANCH = "devnet";
export const MCP_SERVER_NAME = "acta";
/** Where the server keeps the wallet it makes for itself. */
export const WALLET_FILE = "~/.acta-mcp/wallet.json";
/** The built server, inside a clone of the repository. */
const BUILT_CLI = "packages/mcp/dist/cli.js";
/** Stands in for the clone's folder where a config file needs a full path. */
const CLI_PLACEHOLDER = `/absolute/path/to/web-app/${BUILT_CLI}`;
/** The same file, in a shell that is standing in the clone. */
const CLI_HERE = `"$PWD/${BUILT_CLI}"`;

/** The site's own read-only endpoint. */
export function hostedMcpUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/mcp`;
}

type Command = { command: string; args: string[] };

/** What starts the server on the agent's machine. */
export function localCommand(cliPath = CLI_PLACEHOLDER): Command {
  return MCP_PUBLISHED ? { command: "npx", args: ["-y", MCP_PACKAGE] } : { command: "node", args: [cliPath] };
}

const shell = ({ command, args }: Command) => [command, ...args].join(" ");
/** Indented JSON with a list of plain values kept on one line, so an entry is as short as it reads. */
const json = (value: unknown) =>
  JSON.stringify(value, null, 2).replace(/\[\n\s+([^[\]{}]*?)\n\s+\]/g, (_, inner: string) => `[${inner.split(/,\n\s+/).join(", ")}]`);

/** Getting the server onto the machine. Empty once it is on npm: `npx` fetches it. */
export function buildSteps(): string[] {
  return MCP_PUBLISHED
    ? []
    : [`git clone -b ${MCP_BRANCH} ${MCP_REPO}.git`, "cd web-app", "npm install", "npm run build:mcp"];
}

/** The entry an MCP client's config file takes for the server that runs on the machine. */
export function localConfig(): string {
  return json({ mcpServers: { [MCP_SERVER_NAME]: localCommand() } });
}

/** The entry for the site's read-only endpoint, for clients that take remote servers from a file. */
export function hostedConfig(siteOrigin: string): string {
  return json({ mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: hostedMcpUrl(siteOrigin) } } });
}

/**
 * What a person pastes to their agent so it connects itself. Whole in itself: an agent that
 * cannot open a web page can still follow it, and the person can read what they are asking for.
 */
export function agentPrompt(siteOrigin: string): string {
  const name = MCP_SERVER_NAME;
  const steps = MCP_PUBLISHED
    ? [
        [
          `Add an MCP server to yourself under the name "${name}", for every project, replacing any server already called that. It needs Node 22 or later:`,
          "command: npx",
          `arguments: -y ${MCP_PACKAGE}`,
        ],
      ]
    : [
        ["Build the MCP server in a folder that will stay where it is. It needs Node 22 or later:", ...cloneAndBuild()],
        [
          `Add it to yourself as an MCP server under the name "${name}", for every project, replacing any server already called that:`,
          "command: node",
          `argument: the absolute path of web-app/${BUILT_CLI}`,
        ],
      ];
  steps.push(
    [`If the ${name} tools are not there until you are restarted, tell me to restart you and stop.`],
    ["Call acta_status and tell me the wallet's address, what it holds and its limits."],
  );
  const numbered = steps.map(([first, ...rest], i) => [`${i + 1}. ${first}`, ...rest.map((line) => `   ${line}`)].join("\n"));

  return [
    "Connect yourself to Acta, an options venue on Solana.",
    "",
    ...numbered,
    "",
    `The server needs no key and no settings. On its first call it makes its own wallet in ${WALLET_FILE.replace(/\/[^/]+$/, "")}.`,
    "Do not place a trade until I ask for one. Never open or print the key file.",
    `The full guide is ${siteOrigin.replace(/\/$/, "")}/agent`,
  ].join("\n");
}

/** The clone and build as two lines, the way a prompt gives them. */
function cloneAndBuild(): string[] {
  const [clone, ...rest] = buildSteps();
  return [clone, rest.join(" && ")];
}

export type ConnectMode = "trade" | "read";

/** The one thing a person does to add a server to a tool: follow a link, run a command or paste an entry. */
export type ToolSetup = {
  /** What to do, said in a line. */
  title: string;
  /** Opens the tool and asks to add the server. */
  link?: { label: string; href: string };
  /** A command, a config entry or a prompt, with where it goes. `wrap` marks prose. */
  block?: { label: string; text: string; wrap?: boolean };
  /** One line under it, where the step needs explaining. */
  note?: string;
};

export type AgentTool = {
  id: string;
  name: string;
  /** Adding the server that runs on the person's machine and trades. Null where the tool cannot run one. */
  trade: ToolSetup | null;
  /** Adding the site's read-only endpoint. Null where the tool takes no remote server. */
  read: ToolSetup | null;
};

/** Cursor's install link: the server's entry as base64 JSON. */
function cursorLink(entry: object): string {
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${encodeURIComponent(btoa(JSON.stringify(entry)))}`;
}

/** VS Code's install link: the server's entry, with its name, as URL-encoded JSON. */
function vscodeLink(entry: object): string {
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: MCP_SERVER_NAME, ...entry }))}`;
}

/** Goose's install link: each part of the command or the address as its own URL-encoded parameter. */
function gooseLink(server: { cmd: string; arg: string[] } | { url: string; type: string }): string {
  const params = new URLSearchParams();
  if ("cmd" in server) {
    params.set("cmd", server.cmd);
    for (const arg of server.arg) params.append("arg", arg);
  } else {
    params.set("url", server.url);
    params.set("type", server.type);
  }
  params.set("id", MCP_SERVER_NAME);
  params.set("name", "Acta");
  params.set("description", "Options on Solana");
  // Goose asks for %20, not the + a form would use.
  return `goose://extension?${params.toString().replace(/\+/g, "%20")}`;
}

/** The entry Goose keeps in its config file for an extension. */
function gooseYaml(server: { type: "stdio"; cmd: string; args: string[] } | { type: "streamable_http"; uri: string }): string {
  const own = server.type === "stdio" ? [`cmd: ${server.cmd}`, `args: ${JSON.stringify(server.args)}`] : [`uri: ${JSON.stringify(server.uri)}`];
  return ["extensions:", `  ${MCP_SERVER_NAME}:`, ...[`type: ${server.type}`, `name: ${MCP_SERVER_NAME}`, "enabled: true", ...own, "timeout: 300"].map((line) => `    ${line}`)].join("\n");
}

/** Kiro's install link: the server's entry as URL-encoded JSON. */
function kiroLink(entry: object): string {
  return `https://kiro.dev/launch/mcp/add?name=${MCP_SERVER_NAME}&config=${encodeURIComponent(JSON.stringify(entry))}`;
}

/** LM Studio's install link: the server's entry as base64 JSON, as Cursor's. */
function lmStudioLink(entry: object): string {
  return `lmstudio://add_mcp?name=${MCP_SERVER_NAME}&config=${encodeURIComponent(btoa(JSON.stringify(entry)))}`;
}

/**
 * The grid: one button for each maker people know, and one for everything else. Nine and a
 * catch-all, two rows of five, so the page stays a choice a person makes at a glance. `apps` are the maker's
 * tools in the order they are offered; the first is the one shown when the button is picked.
 * `icon` is a file in `public/images/agent-tools`, drawn in the text colour.
 */
const PROVIDERS: ReadonlyArray<{ id: string; name: string; icon: string; apps: ReadonlyArray<string> }> = [
  { id: "claude", name: "Claude", icon: "claude.svg", apps: ["claude-code", "claude-desktop", "claude"] },
  { id: "openai", name: "OpenAI", icon: "openai.svg", apps: ["codex", "chatgpt"] },
  { id: "cursor", name: "Cursor", icon: "cursor.svg", apps: ["cursor"] },
  { id: "copilot", name: "GitHub Copilot", icon: "githubcopilot.svg", apps: ["vscode", "copilot-cli"] },
  { id: "gemini", name: "Gemini", icon: "googlegemini.svg", apps: ["gemini-cli"] },
  { id: "deepseek", name: "DeepSeek", icon: "deepseek.svg", apps: ["deepseek-harness"] },
  { id: "glm", name: "GLM (Z.ai)", icon: "zai.svg", apps: ["zcode"] },
  { id: "hermes", name: "Hermes", icon: "hermes.png", apps: ["hermes"] },
  { id: "openclaw", name: "OpenClaw", icon: "openclaw.svg", apps: ["openclaw"] },
  {
    id: "other",
    name: "Other agents",
    icon: "other.svg",
    apps: ["other", "devin", "cline", "goose", "opencode", "zed", "kiro", "warp", "amp", "droid", "qwen-code", "lm-studio"],
  },
];

export type AgentProvider = { id: string; name: string; icon: string; apps: AgentTool[] };

const DSH_NOTE = "If the file already has entries, add this one to the list. Then start a new session";
/**
 * The desktop app starts servers with the system's short PATH, not the shell's, so a Node
 * installed by a version manager is not found. The full path of npx alone is not enough: npx
 * starts `node` by name, so node's folder has to be on the server's PATH as well.
 */
const DSH_TRADE_NOTE = `${DSH_NOTE}. It needs Node 22 or later. The desktop app does not see your shell's PATH. If the server does not start there, run "which npx", put that full path in command, and add env: { PATH: "<its folder>:/usr/bin:/bin" } so node is found too`;
const ZCODE_NOTE = "A new task picks it up. In an open one, send /reload";

/** The entry DeepSeek Harness takes in its patch file: its MCP client plugin, pointed at one server. */
function dshYaml(config: string[]): string {
  return [
    "- insert:",
    `    - id: ${MCP_SERVER_NAME}-mcp`,
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    ...[`serverName: ${MCP_SERVER_NAME}`, ...config].map((line) => `        ${line}`),
  ].join("\n");
}

const HERMES_NOTE = "It lists the tools it found and asks to enable them: press Enter. Then start a new session, or send /reload-mcp";

/** Claude's link that opens its add-connector dialog with the name and address filled in. The person still confirms. */
function claudeLink(url: string): string {
  return `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Acta&connectorUrl=${encodeURIComponent(url)}`;
}

const RESTART = "Restart it if the tools do not show up";

/**
 * Every tool Acta can be added to, each with the one step that adds it: a link where the tool
 * has one, otherwise the exact command, otherwise the entry for its config file. A tool goes in
 * this list only with a way that was run here or read in its own documentation.
 *
 * Until the server is on npm a config file cannot know where the repository was built, so the
 * file-based tools show a path to fill in and get no link.
 */
export function agentTools(siteOrigin: string): AgentTool[] {
  const url = hostedMcpUrl(siteOrigin);
  const name = MCP_SERVER_NAME;
  const local = localCommand();
  const run = MCP_PUBLISHED ? shell(local) : `node ${CLI_HERE}`;
  const fill = MCP_PUBLISHED ? undefined : `Build it first: ${buildSteps().join(" && ")}. Then put that folder where the path says /absolute/path/to`;
  const built = MCP_PUBLISHED ? undefined : `Run it in the folder you built the server in: ${buildSteps().join(" && ")}`;
  /** A command in a terminal. */
  const command = (tool: string, text: string, note: string | null | undefined = built): ToolSetup => ({
    title: `Run this in a terminal to add Acta to ${tool}`,
    block: { label: "Terminal", text },
    note: note ?? undefined,
  });
  /** An entry in the tool's config, with where that is. */
  /** `note`: left out, the tool is one that needs a restart; null, one that picks the entry up by itself. */
  const entry = (tool: string, where: string, value: unknown, note: string | null = fill ?? RESTART): ToolSetup => ({
    title: `Add this to ${tool}'s MCP servers`,
    block: { label: where, text: typeof value === "string" ? value : json(value) },
    note: note ?? undefined,
  });
  /** A remote server added in the tool's own settings screen. */
  const connector = (tool: string, where: string, note?: string): ToolSetup => ({
    title: `Add this address in ${tool}`,
    block: { label: where, text: url },
    note,
  });
  /** The same step with a link that does it. The link is the step; the rest is the way by hand. */
  const linked = (tool: string, label: string, href: string, byHand: ToolSetup): ToolSetup => ({
    ...byHand,
    title: `Add Acta to ${tool}`,
    link: { label, href },
  });
  /** A link only where the server needs nothing filled in first. */
  const linkedWhenPublished = (tool: string, label: string, href: string, byHand: ToolSetup): ToolSetup =>
    MCP_PUBLISHED ? linked(tool, label, href, byHand) : byHand;

  const tools: AgentTool[] = [
    {
      id: "claude-code",
      name: "Claude Code",
      trade: command("Claude Code", `claude mcp add --scope user ${name} -- ${run}`),
      read: command("Claude Code", `claude mcp add --scope user --transport http ${name} ${url}`, null),
    },
    {
      id: "claude",
      name: "Claude on the web",
      trade: null,
      read: linked(
        "Claude",
        "Add to Claude",
        claudeLink(url),
        connector("Claude", "Customize > Connectors > Add custom connector", "On the web, desktop and phone. Pick No sign in. The free plan takes one custom connector"),
      ),
    },
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      trade: entry(
        "Claude Desktop",
        "Settings > Developer > Edit Config",
        { mcpServers: { [name]: local } },
        fill ?? "Quit Claude fully and open it again. It needs Node 22 or later on the machine",
      ),
      read: linked(
        "Claude Desktop",
        "Add to Claude",
        claudeLink(url),
        connector("Claude", "Customize > Connectors > Add custom connector", "Pick No sign in. The free plan takes one custom connector"),
      ),
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      trade: null,
      read: connector(
        "ChatGPT",
        "chatgpt.com/plugins > + > Add custom MCP server",
        "Pick No authentication. On the web, for Business, Enterprise, Edu and Pro plans",
      ),
    },
    {
      id: "cursor",
      name: "Cursor",
      trade: linkedWhenPublished("Cursor", "Add to Cursor", cursorLink(local), entry("Cursor", "~/.cursor/mcp.json", { mcpServers: { [name]: local } })),
      read: linked("Cursor", "Add to Cursor", cursorLink({ url }), entry("Cursor", "~/.cursor/mcp.json", { mcpServers: { [name]: { url } } }, RESTART)),
    },
    {
      id: "vscode",
      name: "VS Code",
      trade: linkedWhenPublished(
        "VS Code",
        "Add to VS Code",
        vscodeLink({ type: "stdio", ...local }),
        command("VS Code", `code --add-mcp '${JSON.stringify({ name, type: "stdio", ...local })}'`, fill ?? null),
      ),
      read: linked(
        "VS Code",
        "Add to VS Code",
        vscodeLink({ type: "http", url }),
        command("VS Code", `code --add-mcp '${JSON.stringify({ name, type: "http", url })}'`, null),
      ),
    },
    {
      id: "copilot-cli",
      name: "Copilot CLI",
      trade: command("Copilot CLI", `copilot mcp add ${name} -- ${run}`),
      read: command("Copilot CLI", `copilot mcp add --transport http ${name} ${url}`, null),
    },
    {
      id: "codex",
      name: "Codex",
      trade: command("Codex", `codex mcp add ${name} -- ${run}`),
      read: command("Codex", `codex mcp add ${name} --url ${url}`, null),
    },
    {
      id: "deepseek-harness",
      name: "DeepSeek Harness",
      trade: entry(
        "DeepSeek Harness",
        "~/.dsh/cordis.patch.yml",
        dshYaml(["transport: stdio", `command: ${local.command}`, `args: ${JSON.stringify(local.args)}`, "toolCallTimeoutMs: 180000"]),
        fill ?? DSH_TRADE_NOTE,
      ),
      read: entry("DeepSeek Harness", "~/.dsh/cordis.patch.yml", dshYaml(["transport: streamable-http", `url: ${url}`]), DSH_NOTE),
    },
    {
      id: "zcode",
      name: "ZCode",
      trade: entry("ZCode", "Settings > MCP Servers > New > JSON", { mcpServers: { [name]: local } }, fill ?? ZCODE_NOTE),
      read: entry("ZCode", "Settings > MCP Servers > New > JSON", { mcpServers: { [name]: { type: "http", url } } }, ZCODE_NOTE),
    },
    {
      id: "hermes",
      name: "Hermes",
      trade: command(
        "Hermes",
        MCP_PUBLISHED ? `hermes mcp add ${name} --command ${local.command} --args ${local.args.join(" ")}` : `hermes mcp add ${name} --command node --args ${CLI_HERE}`,
        built ?? HERMES_NOTE,
      ),
      read: command("Hermes", `hermes mcp add ${name} --url ${url}`, HERMES_NOTE),
    },
    {
      id: "openclaw",
      name: "OpenClaw",
      trade: command(
        "OpenClaw",
        MCP_PUBLISHED ? `openclaw mcp add ${name} --command ${local.command} ${local.args.map((arg) => `--arg ${arg}`).join(" ")}` : `openclaw mcp add ${name} --command node --arg ${CLI_HERE}`,
        built ?? "If the Gateway is running, add --no-probe",
      ),
      read: command("OpenClaw", `openclaw mcp add ${name} --url ${url} --transport streamable-http`, "If the Gateway is running, add --no-probe"),
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      trade: command("Gemini CLI", `gemini mcp add -s user ${name} ${run}`),
      read: command("Gemini CLI", `gemini mcp add -s user --transport http ${name} ${url}`, null),
    },
    {
      id: "devin",
      name: "Windsurf (Devin)",
      trade: command("Devin", `devin mcp add -s user ${name} -- ${run}`),
      read: command("Devin", `devin mcp add -s user ${name} ${url}`, null),
    },
    {
      id: "cline",
      name: "Cline",
      trade: entry("Cline", "MCP Servers > Configure > Configure MCP Servers", { mcpServers: { [name]: local } }, fill ?? null),
      read: entry("Cline", "MCP Servers > Configure > Configure MCP Servers", { mcpServers: { [name]: { type: "streamableHttp", url } } }, null),
    },
    {
      id: "goose",
      name: "Goose",
      trade: linkedWhenPublished(
        "Goose",
        "Add to Goose",
        gooseLink({ cmd: local.command, arg: local.args }),
        entry("Goose", "~/.config/goose/config.yaml", gooseYaml({ type: "stdio", cmd: local.command, args: local.args })),
      ),
      read: linked(
        "Goose",
        "Add to Goose",
        gooseLink({ url, type: "streamable_http" }),
        entry("Goose", "~/.config/goose/config.yaml", gooseYaml({ type: "streamable_http", uri: url }), RESTART),
      ),
    },
    {
      id: "opencode",
      name: "OpenCode",
      trade: entry("OpenCode", "~/.config/opencode/opencode.json", { mcp: { [name]: { type: "local", command: [local.command, ...local.args], enabled: true } } }),
      read: entry("OpenCode", "~/.config/opencode/opencode.json", { mcp: { [name]: { type: "remote", url, enabled: true } } }, RESTART),
    },
    {
      id: "zed",
      name: "Zed",
      trade: entry("Zed", "settings.json (zed: open settings file)", { context_servers: { [name]: { ...local, env: {} } } }, fill ?? null),
      read: entry("Zed", "settings.json (zed: open settings file)", { context_servers: { [name]: { url } } }, null),
    },
    {
      id: "kiro",
      name: "Kiro",
      trade: linkedWhenPublished("Kiro", "Add to Kiro", kiroLink(local), entry("Kiro", "~/.kiro/settings/mcp.json", { mcpServers: { [name]: local } }, fill ?? null)),
      read: linked("Kiro", "Add to Kiro", kiroLink({ url }), entry("Kiro", "~/.kiro/settings/mcp.json", { mcpServers: { [name]: { url } } }, null)),
    },
    {
      id: "warp",
      name: "Warp",
      trade: entry("Warp", "Settings > Agents > MCP servers > Add", { [name]: local }, fill ?? "Press Start on the server after adding it"),
      read: entry("Warp", "Settings > Agents > MCP servers > Add", { [name]: { url } }, "Press Start on the server after adding it"),
    },
    {
      id: "amp",
      name: "Amp",
      trade: command("Amp", `amp mcp add ${name} -- ${run}`),
      read: command("Amp", `amp mcp add ${name} ${url}`, null),
    },
    {
      id: "droid",
      name: "Droid",
      trade: command("Droid", `droid mcp add ${name} "${run.replace(/"/g, '\\"')}"`),
      read: command("Droid", `droid mcp add ${name} ${url} --type http`, null),
    },
    {
      id: "qwen-code",
      name: "Qwen Code",
      trade: entry("Qwen Code", "~/.qwen/settings.json", { mcpServers: { [name]: local } }, fill ?? null),
      read: command("Qwen Code", `qwen mcp add --transport http ${name} ${url}`, null),
    },
    {
      id: "lm-studio",
      name: "LM Studio",
      trade: linkedWhenPublished(
        "LM Studio",
        "Add to LM Studio",
        lmStudioLink(local),
        entry("LM Studio", "Program > Install > Edit mcp.json", { mcpServers: { [name]: local } }, fill ?? null),
      ),
      read: linked(
        "LM Studio",
        "Add to LM Studio",
        lmStudioLink({ url }),
        entry("LM Studio", "Program > Install > Edit mcp.json", { mcpServers: { [name]: { url } } }, null),
      ),
    },
    {
      id: "other",
      name: "Any agent",
      trade: {
        title: "Paste this to your agent. It connects itself",
        block: { label: "Prompt", text: agentPrompt(siteOrigin), wrap: true },
      },
      read: connector("your agent", "MCP or connector settings", "A remote MCP server over Streamable HTTP, with no sign in"),
    },
  ];
  // In the order the grid offers them.
  const order = PROVIDERS.flatMap((provider) => provider.apps).map((id) => tools.find((tool) => tool.id === id));
  return order.filter((tool): tool is AgentTool => Boolean(tool));
}

/** The grid's buttons, each with its tools. */
export function agentProviders(siteOrigin: string): AgentProvider[] {
  const tools = agentTools(siteOrigin);
  return PROVIDERS.map(({ apps, ...provider }) => ({
    ...provider,
    apps: apps.flatMap((id) => tools.filter((tool) => tool.id === id)),
  }));
}

/**
 * The limits a person can set. `label` and `shown` are what the page says (the default as a
 * figure); `name` is the server setting that changes it, `fallback` that setting's default.
 */
export const LIMIT_SETTINGS: ReadonlyArray<{ name: string; label: string; shown: string; meaning: string; fallback: string }> = [
  { name: "ACTA_MAX_TRADE_USD", label: "Per trade", shown: "$2,500", meaning: "Largest strike times size of one trade or one option funding, or dollar value of one vault deposit", fallback: "2500" },
  { name: "ACTA_DAILY_LIMIT_USD", label: "Per day", shown: "$10,000", meaning: "Most strike times size, option funding and vault deposits in any 24 hours", fallback: "10000" },
  { name: "ACTA_ALLOWED_ASSETS", label: "Assets", shown: "All listed", meaning: "The only assets it may trade, comma separated", fallback: "every listed asset" },
  { name: "ACTA_READ_ONLY", label: "Read only", shown: "Off", meaning: "Set to 1 and it never trades", fallback: "off" },
];

/** What to ask an agent that only reads. */
export const READ_PROMPTS: ReadonlyArray<string> = ["What can I trade on Acta, and what does selling each side pay right now?"];

/** What to ask an agent that trades, from a first look to a trade. The first shows the wallet it made. */
export const EXAMPLE_PROMPTS: ReadonlyArray<string> = [
  "Show my Acta status and what I can trade",
  "I think BTC stays above its nearest lower strike this week. Preview selling that with 0.001 BTC of size.",
  "Place it if I get at least what the preview showed, then show my open positions.",
];
