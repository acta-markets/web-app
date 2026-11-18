"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useSolana } from "@/components/solana/solana-wallet-provider";
import { seasonResource } from "@/components/rewards/use-season";
import { useTokenBalance } from "@/components/wallet/use-token-balance";
import { IS_MAINNET } from "@/lib/network";
import { numberFormat } from "@/lib/number-format";
import { APP_HOME } from "@/lib/app-enabled";
import { firstSignInDestination, readWelcomeSeen, signInFailureText, signInView, welcomeSeenKey, writeWelcomeSeen } from "@/lib/onboarding";
import { seasonLeagues } from "@/lib/rewards/view";
import { useResource } from "@/lib/state/use-resource";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { TOKENS, displayQuoteSymbol, getNetwork } from "@/lib/tokens";
import { SignInModal, type SignInBalance } from "./sign-in-modal";

/** The prompt waits this long, so a session that resumes without a signature never flashes it. */
const PROMPT_DELAY_MS = 800;
/** After signing in, how long to wait to learn whether the wallet has traded before closing quietly. */
const STATUS_WAIT_MS = 4_000;
/** Funds are on their way right after a first sign-in: look often, then fall back to the usual pace. */
const FUNDS_FAST_MS = 5_000;
const FUNDS_SLOW_MS = 30_000;
const FUNDS_FAST_FOR_MS = 120_000;

const usdc = numberFormat({ minimumFractionDigits: 0, maximumFractionDigits: 2 });
const sol = numberFormat({ minimumFractionDigits: 0, maximumFractionDigits: 4 });

/**
 * Watches the wallet's sign-in and drives `SignInModal`: the prompt while the wallet is asked
 * to sign, a way to try again when it did not, and the welcome for a wallet that is new.
 * Mounted once, inside the RFQ provider.
 */
export function SignInOnboarding() {
  const { connectionState, isAuthenticated, authenticate, referralStatus, referralInfo, signInNeedsSignature, signInError, sessionElsewhere } = useRfqContext();
  const { isConnected, selectedAccount, signMessage } = useSolana();
  const wallet = isConnected ? (selectedAccount?.address ?? null) : null;

  const [prompted, setPrompted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);
  const [seenTick, setSeenTick] = useState(0);

  const authenticating = connectionState === "authenticating";
  const previous = useRef({ authenticating: false, wallet: wallet });
  /** A retry keeps the modal up instead of hiding it for the prompt's delay. */
  const retrying = useRef(false);
  /** The referral info as it was when this sign-in began: anything else arrived after it. */
  const infoAtStart = useRef(referralInfo);

  // Each sign-in starts clean.
  useEffect(() => {
    const before = previous.current;
    previous.current = { authenticating, wallet };
    if (wallet !== before.wallet) {
      setPrompted(false);
      setDismissed(false);
      setFailure(null);
      setGaveUpWaiting(false);
      return;
    }
    if (authenticating && !before.authenticating) {
      infoAtStart.current = referralInfo;
      setPrompted(retrying.current);
      retrying.current = false;
      setDismissed(false);
      setFailure(null);
      setGaveUpWaiting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticating, wallet, isAuthenticated]);

  // A failed sign-in is what the provider says is one. The connection passing through other
  // states on its way (the server's welcome arriving mid sign-in reports "connected") is not.
  useEffect(() => {
    if (signInError && wallet) {
      setFailure(signInFailureText(signInError));
      setDismissed(false);
    }
  }, [signInError, wallet]);

  // Resuming a stored session asks the wallet for nothing, so there is nothing to prompt for,
  // however long the resume takes. The prompt is for a signature only.
  const needsSignature = signInNeedsSignature !== false;
  useEffect(() => {
    if (!authenticating || prompted || !needsSignature) return;
    const id = window.setTimeout(() => setPrompted(true), PROMPT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [authenticating, prompted, needsSignature]);

  // the notice that another tab took the session comes back each time it happens
  useEffect(() => {
    if (sessionElsewhere) setDismissed(false);
  }, [sessionElsewhere]);

  const takerStatus = isAuthenticated && referralInfo && referralInfo !== infoAtStart.current ? referralInfo.status : null;
  useEffect(() => {
    if (!isAuthenticated || !prompted || takerStatus !== null) return;
    const id = window.setTimeout(() => setGaveUpWaiting(true), STATUS_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [isAuthenticated, prompted, takerStatus]);

  const seenKey = useMemo(() => (wallet ? welcomeSeenKey(getRfqBackendUrl(), wallet) : null), [wallet]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seen = useMemo(() => readWelcomeSeen(seenKey), [seenKey, seenTick]);

  const view = signInView({
    connection: authenticating ? "authenticating" : isAuthenticated ? "authenticated" : "other",
    prompted,
    dismissed,
    failed: failure !== null,
    elsewhere: sessionElsewhere === true && wallet !== null,
    gateOpen: referralStatus === "required",
    takerStatus,
    seen,
    gaveUpWaiting,
  });
  const welcome = view === "welcome";

  // A first sign-in lands on Trade, once, with the welcome over it. The modal lives in the
  // app's layout, so it stays up across the move.
  const router = useRouter();
  const pathname = usePathname();
  const sentHome = useRef(false);
  useEffect(() => {
    if (!welcome) {
      sentHome.current = false;
      return;
    }
    if (sentHome.current) return;
    sentHome.current = true;
    const destination = firstSignInDestination(pathname, APP_HOME);
    if (destination) router.push(destination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcome]);

  // What the wallet holds, read only while the welcome is up, and often while funds are on their way.
  const network = getNetwork();
  const [fast, setFast] = useState(true);
  useEffect(() => {
    if (!welcome) return;
    setFast(true);
    const id = window.setTimeout(() => setFast(false), FUNDS_FAST_FOR_MS);
    return () => window.clearTimeout(id);
  }, [welcome]);
  const owner = welcome && !IS_MAINNET ? (wallet ?? undefined) : undefined;
  const usdcBalance = useTokenBalance(owner, TOKENS.USDC.mint[network], TOKENS.USDC.decimals, fast ? FUNDS_FAST_MS : FUNDS_SLOW_MS);
  const solBalance = useTokenBalance(owner, TOKENS.SOL.mint[network], TOKENS.SOL.decimals, fast ? FUNDS_FAST_MS : FUNDS_SLOW_MS);
  const funded = (usdcBalance ?? 0) > 0;
  useEffect(() => {
    if (funded) setFast(false);
  }, [funded]);
  const balances: SignInBalance[] = [];
  if (usdcBalance) balances.push({ symbol: displayQuoteSymbol(), amount: usdc.format(usdcBalance) });
  if (solBalance) balances.push({ symbol: "SOL", amount: sol.format(solBalance) });

  // A season is read only for the welcome; no season, or no answer, simply leaves the league line out.
  const season = useResource(seasonResource(false, welcome));
  const league = useMemo(() => {
    if (!season.data) return null;
    const live = seasonLeagues(season.data, Math.floor(Date.now() / 1000), { mainnet: IS_MAINNET }).open.find((l) => l.live);
    return live ? { name: live.name, endsText: live.expiryText } : null;
  }, [season.data]);

  const close = useCallback(() => {
    if (welcome) {
      writeWelcomeSeen(seenKey);
      setSeenTick((t) => t + 1);
    }
    setFailure(null);
    setDismissed(true);
  }, [welcome, seenKey]);

  const retry = useCallback(() => {
    if (!wallet) return;
    retrying.current = true;
    setFailure(null);
    setPrompted(true);
    // The provider reports a refused signature through the connection state. A sign-in that
    // could not even start never changes that state, so it is reported from here.
    void authenticate(wallet, signMessage).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!previous.current.authenticating && !/wallet changed/i.test(message)) setFailure(signInFailureText(message));
    });
  }, [wallet, authenticate, signMessage]);

  return (
    <SignInModal
      view={view}
      isNew={!seen}
      mainnet={IS_MAINNET}
      failure={failure ?? ""}
      balances={balances}
      funded={funded}
      league={league}
      onTrade={close}
      onRetry={retry}
      onClose={close}
    />
  );
}
