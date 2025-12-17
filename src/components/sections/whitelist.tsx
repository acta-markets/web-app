 "use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
      className="relative border-y-4 border-black bg-yuzu-main bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] px-4 py-24"
    >
      <div className="relative z-10 mx-auto max-w-3xl">
        <Card className="bg-white p-8 shadow-[12px_12px_0px_0px_#000] md:p-12">
          <div className="mb-8 flex items-start justify-between border-b-4 border-black pb-4">
            <div>
              <h2 className="text-4xl font-black uppercase tracking-tighter md:text-5xl">
                Get Access
              </h2>
              <p className="mt-2 font-bold text-gray-500">
                SECURE YOUR SPOT IN THE CLOSED BETA.
              </p>
            </div>
            <div className="hidden rotate-2 bg-black px-4 py-2 font-mono text-white md:block">
              BATCH #01
            </div>
          </div>

          <form className="space-y-6" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-lg font-black uppercase">
                Email Address
              </label>
              <Input
                type="email"
                placeholder="whale@solana.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={disabled}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-lg font-black uppercase">
                Solana Wallet
              </label>
              <Input
                type="text"
                placeholder="Connect or Paste Address"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                disabled={disabled}
                required
              />
            </div>

            <button
              type="submit"
              disabled={disabled}
              className="mt-4 w-full border-4 border-black bg-black py-6 text-2xl font-black text-yuzu-main shadow-[6px_6px_0px_0px_#888] transition-all hover:bg-yuzu-accent hover:text-white active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status.state === "submitting" ? "SUBMITTING..." : "JOIN WHITELIST ->"}
            </button>
          </form>

          {status.state === "success" && (
            <div className="mt-4 border-4 border-black bg-off-white p-4 text-center font-bold">
              {status.already
                ? "You’re already on the list. See you soon."
                : "You’re in. We’ll reach out with access."}
            </div>
          )}

          {status.state === "error" && (
            <div className="mt-4 border-4 border-black bg-white p-4 text-center font-bold text-black">
              {status.message}
            </div>
          )}

          <div className="mt-6 text-center font-mono text-sm opacity-60">
            * Limited spots available for the alpha squad.
          </div>
        </Card>
      </div>
    </section>
  );
}


