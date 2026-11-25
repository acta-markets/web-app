
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_LIST } from "@/lib/agent/tools";

const ROOT = "public/.well-known/agent-skills";
// The read-only skill stays first: a client that takes the first entry must not get one that trades.
const SKILLS = ["use-acta-public-api", "trade-on-acta"];

describe("agent skill discovery index", () => {
  it("matches the published skill bytes and schema", async () => {
    const index = JSON.parse(await readFile(path.resolve(ROOT, "index.json"), "utf8"));
    expect(index.$schema).toBe(
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    );
    expect(index.skills.map((skill: { name: string }) => skill.name)).toEqual(SKILLS);
    for (const [i, name] of SKILLS.entries()) {
      const bytes = await readFile(path.resolve(ROOT, name, "SKILL.md"));
      const text = bytes.toString("utf8");
      expect(index.skills[i], name).toMatchObject({
        name,
        type: "skill-md",
        url: `/.well-known/agent-skills/${name}/SKILL.md`,
        digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      });
      // the index repeats the skill's own description, so the two cannot drift
      expect(text, name).toContain(`name: ${name}\ndescription: ${index.skills[i].description}\n---`);
    }
  });

  it("the trading skill names only tools that exist", async () => {
    const text = await readFile(path.resolve(ROOT, "trade-on-acta/SKILL.md"), "utf8");
    const named = new Set(text.match(/acta_[a-z_]+[a-z]/g) ?? []);
    const real = new Set(TOOL_LIST.map((tool) => tool.name));
    expect(named.size).toBeGreaterThan(3);
    for (const name of named) expect(real, name).toContain(name);
  });
});
