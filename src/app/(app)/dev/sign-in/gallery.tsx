"use client";

import { useEffect, useState } from "react";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { SignInModal } from "@/components/onboarding/sign-in-modal";
import { signInFailureText, type SignInView } from "@/lib/onboarding";

type Scene = "sign-new" | "sign-returning" | "checking" | "declined" | "timeout" | "welcome-arriving" | "welcome-funded" | "welcome-league" | "welcome-mainnet";
const SCENES: Array<{ value: Scene; label: string }> = [
  { value: "sign-new", label: "Sign, new wallet" },
  { value: "sign-returning", label: "Sign, returning" },
  { value: "checking", label: "Signed, checking" },
  { value: "declined", label: "Declined" },
  { value: "timeout", label: "Timed out" },
  { value: "welcome-arriving", label: "Welcome, funds arriving" },
  { value: "welcome-funded", label: "Welcome, funded" },
  { value: "welcome-league", label: "Welcome, league open" },
  { value: "welcome-mainnet", label: "Welcome, mainnet" },
];

const VIEW: Record<Scene, SignInView> = {
  "sign-new": "sign",
  "sign-returning": "sign",
  checking: "checking",
  declined: "failed",
  timeout: "failed",
  "welcome-arriving": "welcome",
  "welcome-funded": "welcome",
  "welcome-league": "welcome",
  "welcome-mainnet": "welcome",
};

/** Each state of the sign-in modal. Closing it shows the picker; picking a scene opens it again. */
export function SignInGallery() {
  // `?scene=` picks the starting state, so each one can be opened (or screenshotted) directly.
  const [scene, setScene] = useState<Scene>("sign-new");
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("scene");
    if (SCENES.some((s) => s.value === wanted)) setScene(wanted as Scene);
  }, []);
  const funded = scene === "welcome-funded" || scene === "welcome-league";
  return (
    <div className="mx-auto w-full max-w-[850px] pb-16 pt-12 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-8">
      <p className="font-mono text-xs text-content-tertiary">Dev harness · sign-in modal states</p>
      <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
        <AppSegmented
          value={scene}
          onChange={(next) => {
            setScene(next);
            setOpen(true);
          }}
          options={SCENES}
          stretch={false}
          ariaLabel="Scene"
        />
      </div>
      <SignInModal
        view={open ? VIEW[scene] : "hidden"}
        isNew={scene !== "sign-returning"}
        mainnet={scene === "welcome-mainnet"}
        failure={signInFailureText(scene === "timeout" ? "RFQ auth timeout" : "User rejected the request.")}
        balances={
          funded
            ? [
                { symbol: "USDC", amount: "10,000" },
                { symbol: "SOL", amount: "0.1" },
              ]
            : []
        }
        funded={funded}
        league={scene === "welcome-league" ? { name: "SOL Nov 20", endsText: "Nov 20, 08:00 UTC" } : null}
        onTrade={() => setOpen(false)}
        onRetry={() => setScene("sign-new")}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
