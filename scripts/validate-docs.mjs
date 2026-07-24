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

function localMarkdownLinks(markdown) {
  return [...markdown.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter(
      (target) =>
        target &&
        !target.startsWith("#") &&
        !target.startsWith("/") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(target),
    )
    .map((target) => {
      const [beforeFragment, fragment] = target.split("#", 2);
      return {
        target: beforeFragment.split("?", 1)[0],
        fragment: fragment ? decodeURIComponent(fragment) : null,
      };
    });
}

function headingAnchors(markdown) {
  const anchors = new Set();
  const occurrences = new Map();
  let fenced = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)?.[1];
    if (!heading) continue;

    const base = heading
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    const count = occurrences.get(base) ?? 0;
    occurrences.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }

  return anchors;
}

const files = await markdownFiles(root);
const anchorsByFile = new Map();

for (const file of files) {
  anchorsByFile.set(file, headingAnchors(await readFile(file, "utf8")));
}

for (const file of files) {
  const markdown = await readFile(file, "utf8");

  for (const link of localMarkdownLinks(markdown)) {
    const resolved = link.target
      ? path.resolve(path.dirname(file), decodeURIComponent(link.target))
      : file;

    if (
      link.target.endsWith(".md") &&
      (!resolved.startsWith(`${root}${path.sep}`) || !(await exists(resolved)))
    ) {
      errors.push(`${relative(file)} links to missing ${link.target}`);
      continue;
    }

    if (
      link.fragment &&
      (link.target === "" || link.target.endsWith(".md")) &&
      !anchorsByFile.get(resolved)?.has(link.fragment)
    ) {
      errors.push(
        `${relative(file)} links to missing #${link.fragment} in ${relative(resolved)}`,
      );
    }
  }
}

const summary = await readFile(summaryPath, "utf8");
const summaryTargets = localMarkdownLinks(summary)
  .map((link) => link.target)
  .filter((target) => target.endsWith(".md"))
  .map((target) => relative(path.resolve(root, target)));
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
