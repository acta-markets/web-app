// @vitest-environment node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("agent skill discovery index", () => {
  it("matches the published skill bytes and schema", async () => {
    const indexPath = path.resolve("public/.well-known/agent-skills/index.json");
    const skillPath = path.resolve(
      "public/.well-known/agent-skills/use-acta-public-api/SKILL.md",
    );
    const [indexBytes, skillBytes] = await Promise.all([
      readFile(indexPath),
      readFile(skillPath),
    ]);
    const index = JSON.parse(indexBytes.toString("utf8"));
    const digest = `sha256:${createHash("sha256").update(skillBytes).digest("hex")}`;

    expect(index.$schema).toBe(
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    );
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0]).toMatchObject({
      name: "use-acta-public-api",
      type: "skill-md",
      url: "/.well-known/agent-skills/use-acta-public-api/SKILL.md",
      digest,
    });
  });
});
