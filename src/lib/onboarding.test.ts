import { afterEach, describe, expect, it } from "vitest";
import { readWelcomeSeen, signInFailureText, signInSteps, signInView, welcomeSeenKey, writeWelcomeSeen, type SignInInput } from "./onboarding";

const base: SignInInput = {
  connection: "other",
  prompted: false,
  dismissed: false,
  failed: false,
  gateOpen: false,
  takerStatus: null,
  seen: false,
  gaveUpWaiting: false,
};
const signedIn: SignInInput = { ...base, connection: "authenticated", prompted: true };

describe("which state the sign-in modal is in", () => {
  it("stays down while nothing is happening", () => {
    expect(signInView(base)).toBe("hidden");
  });

  it("waits out the delay, so a session resumed without a signature never flashes the prompt", () => {
    expect(signInView({ ...base, connection: "authenticating" })).toBe("hidden");
    expect(signInView({ ...base, connection: "authenticating", prompted: true })).toBe("sign");
  });

  it("reports a sign-in that did not happen, even one refused before the prompt went up", () => {
    expect(signInView({ ...base, failed: true })).toBe("failed");
    expect(signInView({ ...base, failed: true, prompted: true })).toBe("failed");
  });

  it("welcomes a wallet that just signed, has never traded and has not been welcomed here", () => {
    expect(signInView({ ...signedIn, takerStatus: "pending" })).toBe("welcome");
  });

  it("holds the modal while it learns whether the wallet is new, then gives up quietly", () => {
    expect(signInView(signedIn)).toBe("checking");
    expect(signInView({ ...signedIn, gaveUpWaiting: true })).toBe("hidden");
  });

  it("closes for a wallet that has traded before", () => {
    expect(signInView({ ...signedIn, takerStatus: "active" })).toBe("hidden");
  });

  it("welcomes a wallet once per browser", () => {
    expect(signInView({ ...signedIn, takerStatus: "pending", seen: true })).toBe("hidden");
  });

  it("never opens a welcome on a resumed session: it only follows the prompt", () => {
    expect(signInView({ ...signedIn, prompted: false, takerStatus: "pending" })).toBe("hidden");
  });

  it("leaves the screen to the invite gate", () => {
    expect(signInView({ ...signedIn, takerStatus: "pending", gateOpen: true })).toBe("hidden");
  });

  it("stays closed once the visitor closes it, whatever happens next in that sign-in", () => {
    expect(signInView({ ...base, connection: "authenticating", prompted: true, dismissed: true })).toBe("hidden");
    expect(signInView({ ...signedIn, takerStatus: "pending", dismissed: true })).toBe("hidden");
    expect(signInView({ ...base, failed: true, dismissed: true })).toBe("hidden");
  });
});

describe("the steps a new wallet is shown", () => {
  const states = (steps: ReturnType<typeof signInSteps>) => steps.map((s) => `${s.id}:${s.state}`);

  it("on devnet: sign in, test funds, first trade", () => {
    expect(states(signInSteps("sign", { mainnet: false, funded: false }))).toEqual(["sign:now", "funds:next", "trade:next"]);
    expect(states(signInSteps("welcome", { mainnet: false, funded: false }))).toEqual(["sign:done", "funds:now", "trade:next"]);
    expect(states(signInSteps("welcome", { mainnet: false, funded: true }))).toEqual(["sign:done", "funds:done", "trade:now"]);
  });

  it("on mainnet nothing is given, so no funds step is listed", () => {
    expect(states(signInSteps("sign", { mainnet: true, funded: false }))).toEqual(["sign:now", "trade:next"]);
    expect(states(signInSteps("welcome", { mainnet: true, funded: false }))).toEqual(["sign:done", "trade:now"]);
  });
});

describe("why a sign-in failed, in plain words", () => {
  it.each([
    ["User rejected the request.", "The message was declined in your wallet."],
    ["Transaction cancelled", "The message was declined in your wallet."],
    ["RFQ auth timeout", "Your wallet did not answer in time."],
    ["WalletSignMessageError: 0x1f", "The sign-in did not go through."],
    [undefined, "The sign-in did not go through."],
  ])("%s", (message, text) => {
    expect(signInFailureText(message)).toBe(text);
  });
});

describe("remembering a welcome", () => {
  afterEach(() => window.localStorage.clear());

  it("keeps one mark per wallet and backend", () => {
    const devnet = welcomeSeenKey("wss://devnet-api.acta.markets", "WalletA");
    const other = welcomeSeenKey("wss://beta-api.acta.markets", "WalletA");
    expect(devnet).not.toBe(other);
    expect(readWelcomeSeen(devnet)).toBe(false);
    writeWelcomeSeen(devnet);
    expect(readWelcomeSeen(devnet)).toBe(true);
    expect(readWelcomeSeen(other)).toBe(false);
    expect(readWelcomeSeen(welcomeSeenKey("wss://devnet-api.acta.markets", "WalletB"))).toBe(false);
  });

  it("has no key without a wallet or a backend, and then remembers nothing", () => {
    expect(welcomeSeenKey("", "WalletA")).toBeNull();
    expect(welcomeSeenKey("wss://devnet-api.acta.markets", " ")).toBeNull();
    writeWelcomeSeen(null);
    expect(readWelcomeSeen(null)).toBe(false);
  });
});
