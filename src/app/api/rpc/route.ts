import { NextRequest, NextResponse } from "next/server";

const NETWORK =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet" ? "mainnet-beta" : "devnet";

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  (NETWORK === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data);
}
