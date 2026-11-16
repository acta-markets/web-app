/**
 * The sign-in modal's rules: when it is up and what it says. Signing in is the one moment
 * every new wallet passes through, so the modal that asks for the signature is also where a
 * new trader is told what they have and what to do next.
 *
 * Pure, so each state can be tested and drawn in the review gallery without a wallet.
 */

export type SignInView =
  /** Nothing to show. */
  | "hidden"
  /** The wallet is being asked to sign. */
  | "sign"
  /** Signed; waiting to learn whether this wallet is new. */
  | "checking"
  /** The signature did not happen. */
  | "failed"
  /** Signed in for the first time: what the trader has, and the way to a first trade. */
  | "welcome";

export type SignInInput = {
  connection: "authenticating" | "authenticated" | "other";
  /** The sign prompt went up during this sign-in, so the modal is the visitor's current context. */
  prompted: boolean;
  /** The visitor closed the modal during this sign-in. It stays closed until the next one. */
  dismissed: boolean;
  /** This sign-in ended without a signature. */
  failed: boolean;
  /** The invite gate is up; it owns the screen. */
  gateOpen: boolean;
  /** Whether the wallet has traded: "pending" has not, "active" has, null is not known yet. */
  takerStatus: "pending" | "active" | null;
  /** This browser has already welcomed this wallet on this backend. */
  seen: boolean;
  /** Long enough has passed that `takerStatus` is not coming. */
  gaveUpWaiting: boolean;
};

/**
 * The welcome is the sign prompt's next state, never a modal of its own: it follows a
 * signature the visitor just gave, and only for a wallet that has not traded and has not
 * been welcomed here before. A session resumed without a signature shows nothing.
 */
export function signInView(i: SignInInput): SignInView {
  if (i.dismissed) return "hidden";
  if (i.failed) return "failed";
  if (i.connection === "authenticating") return i.prompted ? "sign" : "hidden";
  if (i.connection === "authenticated" && i.prompted && !i.seen && !i.gateOpen) {
    if (i.takerStatus === "pending") return "welcome";
    if (i.takerStatus === null && !i.gaveUpWaiting) return "checking";
  }
  return "hidden";
}

export type SignInStep = { id: "sign" | "funds" | "trade"; label: string; state: "done" | "now" | "next" };

/**
 * What a new wallet goes through, as the prompt lists it. Test funds are a devnet step only:
 * on mainnet nobody is given anything, and the list must not suggest it.
 */
export function signInSteps(view: "sign" | "checking" | "welcome", { mainnet, funded }: { mainnet: boolean; funded: boolean }): SignInStep[] {
  const signed = view !== "sign";
  const steps: SignInStep[] = [{ id: "sign", label: "Sign in", state: signed ? "done" : "now" }];
  if (!mainnet) steps.push({ id: "funds", label: "Test funds in your wallet", state: funded ? "done" : signed ? "now" : "next" });
  steps.push({ id: "trade", label: "Your first trade", state: signed && (mainnet || funded) ? "now" : "next" });
  return steps;
}

/** Why a sign-in did not complete, in plain words. The wallet's own message is not shown: it differs by wallet and is rarely a sentence. */
export function signInFailureText(message: string | null | undefined): string {
  const text = (message ?? "").toLowerCase();
  if (/reject|denied|declin|cancel|refus/.test(text)) return "The message was declined in your wallet.";
  if (/timeout|timed out/.test(text)) return "Your wallet did not answer in time.";
  return "The sign-in did not go through.";
}

const SEEN_KEY = "acta_welcome_seen";

/** One key per wallet and backend: a wallet welcomed on devnet is still new on another backend. */
export function welcomeSeenKey(backendUrl: string, wallet: string): string | null {
  const backend = backendUrl.trim();
  const address = wallet.trim();
  if (!backend || !address) return null;
  return `${SEEN_KEY}:${encodeURIComponent(backend)}:${encodeURIComponent(address)}`;
}

/** Storage can be unavailable (private mode, blocked); then nobody is "seen" and nothing is remembered. */
export function readWelcomeSeen(key: string | null): boolean {
  if (!key || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeWelcomeSeen(key: string | null): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // not remembered; the welcome may show once more
  }
}
