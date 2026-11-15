import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchPosition: vi.fn(), fetchMarket: vi.fn(), fetchAllMaybePosition: vi.fn(), fetchAllMaybeMarket: vi.fn(), build: vi.fn(), buildWithdraw: vi.fn(), accounts: vi.fn() }));
vi.mock("@acta-markets/ts-sdk", () => ({ fetchPosition: mocks.fetchPosition, fetchMarket: mocks.fetchMarket, fetchAllMaybePosition: mocks.fetchAllMaybePosition, fetchAllMaybeMarket: mocks.fetchAllMaybeMarket }));
vi.mock("@acta-markets/ts-sdk/chain", () => ({
  flows: { buildDepositFundsIxs: mocks.build, buildWithdrawFundsIxs: mocks.buildWithdraw },
  getActaProgramId: () => "program",
  NATIVE_MINT: "native-mint",
  TOKEN_PROGRAM_ID: "token-program",
  deriveAta: async ({ mint }: { mint: string }) => `ata-of-${mint}`,
  decodeTokenAccount: (data: { amount: bigint }) => data,
  closeTokenAccountInstruction: (account: string, destination: string, owner: string) => ({ close: account, destination, owner }),
}));
vi.mock("@solana/kit", async (importOriginal) => ({ ...(await importOriginal<typeof import("@solana/kit")>()), fetchEncodedAccounts: mocks.accounts }));

import { buildBuyDepositGroups, buildBuyDepositInstructions, buildBuyWithdrawInstructions } from "./buy-deposit";

const owner = "So11111111111111111111111111111111111111112";
const pda = "11111111111111111111111111111111";
const market = "SysvarRent111111111111111111111111111111111";
const rpc = {} as Parameters<typeof buildBuyDepositInstructions>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchPosition.mockResolvedValue({ data: "position" });
  mocks.fetchMarket.mockResolvedValue({ data: "market" });
  mocks.build.mockResolvedValue({ ixs: ["ix"] });
});

describe("buildBuyDepositInstructions", () => {
  it("funds from the live accounts with the wallet as owner and fee payer", async () => {
    await expect(buildBuyDepositInstructions(rpc, owner, { pda, market })).resolves.toEqual(["ix"]);
    expect(mocks.fetchPosition).toHaveBeenCalledWith(rpc, pda, { commitment: "confirmed" });
    const args = mocks.build.mock.lastCall![0];
    expect(args).toMatchObject({ programId: "program", payer: owner, position: "position", market: "market" });
    expect(args.owner.address).toBe(owner);
  });

  it("passes on the SDK's refusal of a position that is no longer Open", async () => {
    mocks.build.mockRejectedValue(new Error("funding requires a matching Open position without a vault side"));
    await expect(buildBuyDepositInstructions(rpc, owner, { pda, market })).rejects.toThrow(/Open position/);
  });
});

describe("buildBuyWithdrawInstructions", () => {
  beforeEach(() => {
    mocks.buildWithdraw.mockResolvedValue({ ixs: ["create-ata", "withdraw"], destinationAta: "ata-of-usdc" });
  });

  it("takes the deposit back from the live accounts with the wallet as owner and fee payer", async () => {
    await expect(buildBuyWithdrawInstructions(rpc, owner, { pda, market })).resolves.toEqual(["create-ata", "withdraw"]);
    expect(mocks.fetchPosition).toHaveBeenCalledWith(rpc, pda, { commitment: "confirmed" });
    const args = mocks.buildWithdraw.mock.lastCall![0];
    expect(args).toMatchObject({ programId: "program", payer: owner, position: "position", market: "market" });
    expect(args.owner.address).toBe(owner);
    // a deposit in the quote token is not SOL: the wrapped SOL account is not read
    expect(mocks.accounts).not.toHaveBeenCalled();
  });

  it("unwraps a SOL deposit when the wallet held no wrapped SOL, in the same transaction", async () => {
    mocks.buildWithdraw.mockResolvedValue({ ixs: ["create-ata", "withdraw"], destinationAta: "ata-of-native-mint" });
    mocks.accounts.mockResolvedValue([{ exists: false }]);
    await expect(buildBuyWithdrawInstructions(rpc, owner, { pda, market })).resolves.toEqual([
      "create-ata",
      "withdraw",
      { close: "ata-of-native-mint", destination: owner, owner },
    ]);
    mocks.accounts.mockResolvedValue([{ exists: true, data: { amount: 0n } }]);
    await expect(buildBuyWithdrawInstructions(rpc, owner, { pda, market })).resolves.toHaveLength(3);
  });

  it("leaves wrapped SOL the wallet already held as it is", async () => {
    mocks.buildWithdraw.mockResolvedValue({ ixs: ["create-ata", "withdraw"], destinationAta: "ata-of-native-mint" });
    mocks.accounts.mockResolvedValue([{ exists: true, data: { amount: 5n } }]);
    await expect(buildBuyWithdrawInstructions(rpc, owner, { pda, market })).resolves.toEqual(["create-ata", "withdraw"]);
  });

  it("passes on the SDK's refusal of a position that is not Funded", async () => {
    mocks.buildWithdraw.mockRejectedValue(new Error("withdrawal requires a matching Funded position held by a wallet or Maker"));
    await expect(buildBuyWithdrawInstructions(rpc, owner, { pda, market })).rejects.toThrow(/Funded position/);
  });
});

describe("buildBuyDepositGroups", () => {
  const key = (n: number) => `${"1".repeat(31)}${"23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[n % 32]}${n >= 32 ? "x" : ""}`.slice(0, 32);
  beforeEach(() => {
    mocks.fetchAllMaybePosition.mockImplementation(async (_rpc: unknown, addresses: string[]) => addresses.map((a) => ({ address: a, exists: true, data: `position-${a}` })));
    mocks.fetchAllMaybeMarket.mockImplementation(async (_rpc: unknown, addresses: string[]) => addresses.map((a) => ({ address: a, exists: true, data: `market-${a}` })));
    mocks.build.mockImplementation(async ({ position }: { position: string }) => ({ ixs: [`ix-${position}`] }));
  });

  it("reads every position and each market once, in two requests, and keeps the order", async () => {
    const positions = [
      { pda: key(1), market },
      { pda: key(2), market: owner },
      { pda: key(3), market },
    ];
    const groups = await buildBuyDepositGroups(rpc, owner, positions);
    expect(groups).toEqual(positions.map((p) => ({ instructions: [`ix-position-${p.pda}`] })));
    expect(mocks.fetchAllMaybePosition).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllMaybePosition.mock.calls[0][1]).toEqual(positions.map((p) => p.pda));
    // two positions share a market: it is read once
    expect(mocks.fetchAllMaybeMarket).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllMaybeMarket.mock.calls[0][1]).toEqual([market, owner]);
    expect(mocks.build.mock.calls.map(([args]) => args.market)).toEqual([`market-${market}`, `market-${owner}`, `market-${market}`]);
    // no account is read one at a time
    expect(mocks.fetchPosition).not.toHaveBeenCalled();
    expect(mocks.fetchMarket).not.toHaveBeenCalled();
  });

  it("reads more than a hundred positions a hundred at a time", async () => {
    const positions = Array.from({ length: 130 }, () => ({ pda, market }));
    await expect(buildBuyDepositGroups(rpc, owner, positions)).resolves.toHaveLength(130);
    expect(mocks.fetchAllMaybePosition.mock.calls.map(([, addresses]) => addresses.length)).toEqual([100, 30]);
    expect(mocks.fetchAllMaybeMarket).toHaveBeenCalledTimes(1);
  });

  it("leaves out a position the chain will not take a deposit for, with the reason, and keeps the others", async () => {
    // the second is already funded, the third's account is gone, the fourth's market is
    mocks.build.mockImplementation(async ({ position }: { position: string }) => {
      if (position === `position-${key(2)}`) throw new Error("funding requires a matching Open position held by a wallet or Maker");
      return { ixs: [`ix-${position}`] };
    });
    mocks.fetchAllMaybePosition.mockImplementation(async (_rpc: unknown, addresses: string[]) =>
      addresses.map((a) => (a === key(3) ? { address: a, exists: false } : { address: a, exists: true, data: `position-${a}` })),
    );
    mocks.fetchAllMaybeMarket.mockImplementation(async (_rpc: unknown, addresses: string[]) =>
      addresses.map((a) => (a === owner ? { address: a, exists: false } : { address: a, exists: true, data: `market-${a}` })),
    );
    const groups = await buildBuyDepositGroups(rpc, owner, [
      { pda: key(1), market },
      { pda: key(2), market },
      { pda: key(3), market },
      { pda: key(4), market: owner },
      { pda: key(5), market },
      // a row that came without a usable market address is never sent to the RPC
      { pda: key(6), market: "" },
    ]);
    expect(groups).toEqual([
      { instructions: [`ix-position-${key(1)}`] },
      { skipped: "funding requires a matching Open position held by a wallet or Maker" },
      { skipped: "position not found on chain" },
      { skipped: "market not found on chain" },
      { instructions: [`ix-position-${key(5)}`] },
      { skipped: "position not found on chain" },
    ]);
    expect(mocks.fetchAllMaybePosition.mock.calls[0][1]).not.toContain(key(6));
  });
});
