// Builds a package under packages/ into one file: the entry and the shared core under src/lib
// are bundled, npm packages stay imports. Every imported package must therefore be a
// dependency (or a peer) of that package: the build fails if one is not, because a package that
// resolves here from the repo root would be missing for whoever installs it.
//
//   node scripts/build-mcp.mjs              packages/mcp        -> dist/cli.js   (the MCP server)
//   node scripts/build-mcp.mjs sak-plugin   packages/sak-plugin -> dist/index.js (Solana Agent Kit)
import { readFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const TARGETS = {
  mcp: { entry: "src/cli.ts", out: "dist/cli.js", executable: true },
  "sak-plugin": { entry: "src/index.ts", out: "dist/index.js", executable: false },
};
const name = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "mcp";
const target = TARGETS[name];
if (!target) {
  console.error(`Unknown package "${name}". One of: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(root, "packages", name);
const pkg = JSON.parse(await readFile(path.join(pkgDir, "package.json"), "utf8"));
const outfile = path.join(pkgDir, target.out);

const result = await build({
  entryPoints: [path.join(pkgDir, target.entry)],
  outfile,
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfig: path.join(root, "tsconfig.json"),
  ...(target.executable ? { banner: { js: "#!/usr/bin/env node" } } : {}),
  define: { __ACTA_MCP_VERSION__: JSON.stringify(pkg.version) },
  metafile: true,
  logLevel: "warning",
});

const packageOf = (specifier) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
const imported = new Set(
  Object.values(result.metafile.inputs)
    .flatMap((input) => input.imports)
    .filter((entry) => entry.external && !entry.path.startsWith("node:"))
    .map((entry) => packageOf(entry.path)),
);
const declared = { ...pkg.dependencies, ...pkg.peerDependencies };
const missing = [...imported].filter((dependency) => !declared[dependency]).sort();
if (missing.length > 0) {
  console.error(`packages/${name} imports packages it does not depend on: ${missing.join(", ")}`);
  process.exit(1);
}
const inlined = Object.keys(result.metafile.inputs).filter((file) => !file.includes("node_modules/")).sort();
const forbidden = inlined.filter((file) => /(^|\/)(components|app)\//.test(file) || /\.tsx$/.test(file));
if (forbidden.length > 0) {
  console.error(`packages/${name} must not bundle web app code: ${forbidden.join(", ")}`);
  process.exit(1);
}
if (target.executable) await chmod(outfile, 0o755);
const { bytes } = result.metafile.outputs[path.relative(root, outfile)];
console.log(`packages/${name}/${target.out}  ${(bytes / 1024).toFixed(0)} KB  from ${inlined.length} files; depends on ${[...imported].sort().join(", ")}`);
if (process.argv.includes("--files")) console.log(inlined.join("\n"));
