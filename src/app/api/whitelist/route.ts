import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

type WhitelistPayload = {
  email?: unknown;
  wallet?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidEmail(email: string) {
  // pragmatic check; keep dependencies minimal
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  let body: WhitelistPayload;
  try {
    body = (await req.json()) as WhitelistPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const emailRaw = isNonEmptyString(body.email) ? body.email.trim().toLowerCase() : "";
  const walletRaw = isNonEmptyString(body.wallet) ? body.wallet.trim() : "";

  if (!isValidEmail(emailRaw)) {
    return NextResponse.json({ ok: false, error: "Invalid email." }, { status: 400 });
  }
  // wallet is stored as-provided (no validation)
  if (!walletRaw) {
    return NextResponse.json({ ok: false, error: "Wallet is required." }, { status: 400 });
  }

  let db;
  try {
    db = await getDb();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server misconfigured (missing MongoDB env)." },
      { status: 500 }
    );
  }
  const col = db.collection("whitelist");

  // Best-effort uniqueness; if indexes already exist, this is a no-op.
  await Promise.all([
    col.createIndex({ email: 1 }, { unique: true }),
    col.createIndex({ wallet: 1 }, { unique: true })
  ]);

  const now = new Date();

  // idempotent-ish: if either exists, treat as success
  const existing = await col.findOne({
    $or: [{ email: emailRaw }, { wallet: walletRaw }]
  });

  if (existing) {
    return NextResponse.json({ ok: true, already: true });
  }

  try {
    await col.insertOne({
      email: emailRaw,
      wallet: walletRaw,
      createdAt: now
    });
  } catch (err: any) {
    // handle duplicate index race
    if (err?.code === 11000) {
      return NextResponse.json({ ok: true, already: true });
    }
    return NextResponse.json(
      { ok: false, error: "Failed to save. Try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}


