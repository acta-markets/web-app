import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    nodeEnv: process.env.NODE_ENV,
    hasMongoUri: Boolean(process.env.MONGODB_URI),
    hasMongoDb: Boolean(process.env.MONGODB_DB)
  });
}



