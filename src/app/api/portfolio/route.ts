import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Portfolio API endpoint deprecated. Use RFQ provider positions.",
    },
    { status: 501 }
  );
}


