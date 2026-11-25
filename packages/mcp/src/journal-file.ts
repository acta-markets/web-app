import { appendFile, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { AgentError } from "@/lib/agent/errors";
import { parseJournal, serialQueue, type Journal } from "@/lib/agent/journal";

/** How long a spend waits for another process to leave the journal before it is refused. */
const LOCK_WAIT_MS = 5_000;
const LOCK_RETRY_MS = 25;
/** What is done under the lock takes milliseconds. A lock file this old was left by a process that died. */
const LOCK_STALE_MS = 10_000;

/**
 * One process at a time, by a lock file that only one can create. Each AI tool starts its own
 * server, and they share one wallet and one journal: without this, two of them could each read
 * the day's total, each find room, and each spend.
 *
 * Refuses when the lock cannot be had: no lock, no spend. Breaking a stale lock is not atomic,
 * so two processes arriving at the same dead lock in the same instant could both get in; that
 * takes a crash inside a section a few milliseconds long.
 */
async function withLockFile<T>(file: string, waitMs: number, run: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      await (await open(file, "wx", 0o600)).close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(file).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > LOCK_STALE_MS) {
        await unlink(file).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) {
        throw new AgentError("busy", "Another Acta server on this machine is using the wallet's journal. Try again.", "retry");
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
  try {
    return await run();
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

/**
 * The journal on disk: one JSON line per change, appended and never rewritten, so a crash in
 * the middle of a write costs at most its own last line. Readable by its owner only.
 */
export function fileJournal(directory: string, network: string, options: { lockWaitMs?: number } = {}): Journal {
  const file = path.join(directory, `journal-${network}.jsonl`);
  const lockFile = path.join(directory, `journal-${network}.lock`);
  const queue = serialQueue();
  const ready = () => mkdir(directory, { recursive: true, mode: 0o700 });
  return {
    async read() {
      const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
      return parseJournal(text);
    },
    async append(entry) {
      await ready();
      await appendFile(file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    },
    // Calls in this process wait their turn here; only the one at the front goes for the file.
    lock: (run) =>
      queue(async () => {
        await ready();
        return withLockFile(lockFile, options.lockWaitMs ?? LOCK_WAIT_MS, run);
      }),
  };
}
