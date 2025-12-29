import { NextResponse } from "next/server";
import { portfolioMock, type PortfolioApiResponse } from "@/lib/portfolio";

export async function GET() {
  // TODO: When positions are backed by DB/on-chain, swap this to real data.
  // For now we serve a stable mock so the Portfolio UI is fully implemented.
  const data: PortfolioApiResponse = { ok: true, ...portfolioMock() };
  return NextResponse.json(data);
}


