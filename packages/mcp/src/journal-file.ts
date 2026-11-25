import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseJournal, type Journal } from "@/lib/agent/journal";

/**
 * The journal on disk: one JSON line per change, appended and never rewritten, so a crash in
 * the middle of a write costs at most its own last line. Readable by its owner only.
 */
export function fileJournal(directory: string, network: string): Journal {
  const file = path.join(directory, `journal-${network}.jsonl`);
  return {
    async read() {
      const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
      return parseJournal(text);
    },
    async append(entry) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await appendFile(file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    },
  };
}
