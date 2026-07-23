import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("docs-site");
const summaryPath = path.join(root, "SUMMARY.md");
const errors = [];

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(absolute)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolute);
    }
  }

  return files;
}

function relative(absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

async function exists(absolute) {
  try {
    return (await stat(absolute)).isFile();
  } catch {
    return false;
  }
}

function localMarkdownTargets(markdown) {
  return [...markdown.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter(
      (target) =>
        target &&
        !target.startsWith("#") &&
        !target.startsWith("/") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(target),
    )
    .map((target) => target.split("#", 1)[0].split("?", 1)[0])
    .filter((target) => target.endsWith(".md"));
}

const files = await markdownFiles(root);

for (const file of files) {
  const markdown = await readFile(file, "utf8");

  for (const target of localMarkdownTargets(markdown)) {
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    if (!resolved.startsWith(`${root}${path.sep}`) || !(await exists(resolved))) {
      errors.push(`${relative(file)} links to missing ${target}`);
    }
  }
}

const summary = await readFile(summaryPath, "utf8");
const summaryTargets = localMarkdownTargets(summary).map((target) =>
  relative(path.resolve(root, target)),
);
const duplicateTargets = summaryTargets.filter(
  (target, index) => summaryTargets.indexOf(target) !== index,
);

for (const target of new Set(duplicateTargets)) {
  errors.push(`SUMMARY.md includes ${target} more than once`);
}

const contentFiles = files
  .map(relative)
  .filter((file) => file !== "SUMMARY.md")
  .sort();
const missingFromSummary = contentFiles.filter(
  (file) => !summaryTargets.includes(file),
);

for (const file of missingFromSummary) {
  errors.push(`SUMMARY.md does not include ${file}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${contentFiles.length} documentation pages and ${summaryTargets.length} sidebar entries.`,
  );
}
