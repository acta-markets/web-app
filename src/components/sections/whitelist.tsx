"use client";

import { useMemo, useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { AppButton } from "@/components/app-ui/app-button";

export function Whitelist() {
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "submitting" }
    | { state: "success"; already?: boolean }
    | { state: "error"; message: string }
  >({ state: "idle" });

  const disabled = useMemo(
    () => status.state === "submitting",
    [status.state]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ state: "submitting" });

    try {
      const res = await fetch("/api/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, wallet })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; already?: boolean };

      if (!res.ok || !data.ok) {
        setStatus({ state: "error", message: data.error || "Failed to submit." });
        return;
      }

      setStatus({ state: "success", already: data.already });
    } catch {
      setStatus({ state: "error", message: "Network error. Try again." });
    }
  }

  return (
    <section
      id="whitelist"
      className="relative px-4 py-24"
    >
      <div className="relative z-10 mx-auto max-w-3xl">
        <AppCard className="border border-white/10 bg-white/5 p-8 md:p-10">
          <div className="mb-8 flex items-start justify-between pb-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-content-primary md:text-4xl">
                Get Access
              </h2>
              <p className="mt-2 text-sm font-semibold text-content-tertiary">
                Secure your spot on the whitelist.
              </p>
            </div>
            <div className="hidden rounded-full bg-action-secondary/50 px-4 py-2 text-xs font-semibold text-content-secondary md:block">
              Batch #01
            </div>
          </div>

          <form className="space-y-6" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-content-secondary">
                Email Address
              </label>
              <input
                type="email"
                placeholder="whale@solana.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={disabled}
                required
                className="w-full rounded-xl bg-action-secondary/40 px-4 py-3 text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/40 disabled:opacity-70"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-content-secondary">
                Solana Wallet
              </label>
              <input
                type="text"
                placeholder="Connect or Paste Address"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                disabled={disabled}
                required
                className="w-full rounded-xl bg-action-secondary/40 px-4 py-3 text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/40 disabled:opacity-70"
              />
            </div>

            <AppButton type="submit" disabled={disabled} className="mt-2 w-full">
              {status.state === "submitting" ? "Submitting…" : "Join whitelist →"}
            </AppButton>
          </form>

          {status.state === "success" && (
            <div className="mt-4 rounded-xl bg-action-secondary/40 p-4 text-center text-sm font-semibold text-content-secondary">
              {status.already
                ? "You're already on the list. See you soon."
                : "You're in. We'll reach out with access."}
            </div>
          )}

          {status.state === "error" && (
            <div className="mt-4 rounded-xl bg-additional-red-secondary p-4 text-center text-sm font-semibold text-additional-red-primary">
              {status.message}
            </div>
          )}

          <div className="mt-6 text-center text-xs font-semibold text-content-tertiary">
            * Limited spots available for the alpha squad.
          </div>
        </AppCard>
      </div>
    </section>
  );
}
