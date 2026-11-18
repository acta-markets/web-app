import { createLocalStoreFamily } from "./local-store";

/**
 * The trading session a wallet opened by signing in, kept so the next visit resumes it
 * without another signature. One per backend and wallet: switching wallets and coming back
 * does not cost a signature, and a session of one backend is never offered to another.
 *
 * A session id lets its holder act as the signed-in wallet until it expires, so it is
 * dropped as soon as it stops being useful: when the server refuses it, and when the wallet
 * disconnects.
 */

export type StoredSession = { sessionId: string; expiresAt: number };

function parse(data: unknown): StoredSession | null | undefined {
  if (!data || typeof data !== "object") return undefined;
  const { sessionId, expiresAt } = data as Record<string, unknown>;
  if (typeof sessionId !== "string" || !sessionId) return undefined;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return undefined;
  return { sessionId, expiresAt };
}

const sessions = createLocalStoreFamily<StoredSession | null>({ prefix: "acta_rfq_session", version: 1, fallback: null, parse });
const store = (backend: string, wallet: string) => sessions(`${encodeURIComponent(backend.trim())}:${encodeURIComponent(wallet.trim())}`);

/** Where the one-wallet-at-a-time session lived before sessions were kept per wallet. */
const LEGACY_KEY = "acta_rfq_ws_session";

function legacySession(wallet: string): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(LEGACY_KEY) ?? "null");
    if (!stored || typeof stored !== "object" || (stored as { walletAddress?: unknown }).walletAddress !== wallet) return null;
    return parse(stored) ?? null;
  } catch {
    return null;
  }
}

function dropLegacy(wallet: string) {
  if (legacySession(wallet) === null) return;
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // nothing to clear
  }
}

/** The id to resume with, or null when there is none or it has run out. `expiresAt` is in seconds. */
export function readSessionId(backend: string, wallet: string, nowSecs: number = Math.floor(Date.now() / 1000)): string | null {
  if (!backend || !wallet) return null;
  const session = store(backend, wallet).read() ?? legacySession(wallet);
  return session && session.expiresAt > nowSecs ? session.sessionId : null;
}

export function writeSession(backend: string, wallet: string, sessionId: string, expiresAt: number): void {
  if (!backend || !wallet || !sessionId || !Number.isFinite(expiresAt)) return;
  store(backend, wallet).write({ sessionId, expiresAt });
  dropLegacy(wallet);
}

export function clearSession(backend: string, wallet: string): void {
  if (!backend || !wallet) return;
  store(backend, wallet).clear();
  dropLegacy(wallet);
}
