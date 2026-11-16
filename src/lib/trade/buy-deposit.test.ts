import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchPosition: vi.fn(), fetchMarket: vi.fn(), fetchAllMaybePosition: vi.fn(), fetchAllMaybeMarket: vi.fn(), build: vi.fn(), buildBatch: vi.fn(), buildWithdraw: vi.fn(), accounts: vi.fn() }));
vi.mock("@acta-markets/ts-sdk", () => ({ fetchPosition: mocks.fetchPosition, fetchMarket: mocks.fetchMarket, fetchAllMaybePosition: mocks.fetchAllMaybePosition, fetchAllMaybeMarket: mocks.fetchAllMaybeMarket }));
vi.mock("@acta-markets/ts-sdk/chain", () => ({
  flows: { buildDepositFundsIxs: mocks.build, buildDepositFundsBatchIxs: mocks.buildBatch, buildWithdrawFundsIxs: mocks.buildWithdraw },
  getActaProgramId: () => "program",
  NATIVE_MINT: "native-mint",
  TOKEN_PROGRAM_ID: "token-program",
  deriveAta: async ({ mint }: { mint: string }) => `ata-of-${mint}`,
  decodeTokenAccount: (data: { amount: bigint }) => data,
  closeTokenAccountInstruction: (account: string, destination: string, owner: string) => ({ close: account, destination, owner }),
}));
vi.mock("@solana/kit", async (importOriginal) => ({ ...(await importOriginal<typeof import("@solana/kit")>()), fetchEncodedAccounts: mocks.accounts }));

import { buildBuyDepositBatch, buildBuyDepositInstructions, buildBuyWithdrawInstructions } from "./buy-deposit";

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

describe("buildBuyDepositBatch", () => {
  // distinct 32-byte addresses: thirty zero bytes, then two base58 digits worth two bytes
  const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const key = (n: number) => `${"1".repeat(30)}${BASE58[5 + Math.floor(n / 32)]}${BASE58[n % 32]}`;
  type Item = { position: string; market: string };
  const refusal = "funding requires a matching Open position held by a wallet or Maker";
  beforeEach(() => {
    mocks.fetchAllMaybePosition.mockImplementation(async (_rpc: unknown, addresses: string[]) => addresses.map((a) => ({ address: a, exists: true, data: `position-${a}` })));
    mocks.fetchAllMaybeMarket.mockImplementation(async (_rpc: unknown, addresses: string[]) => addresses.map((a) => ({ address: a, exists: true, data: `market-${a}` })));
    mocks.build.mockImplementation(async ({ position }: { position: string }) => ({ ixs: [`ix-${position}`] }));
    // the SDK's packing stands in as two deposits to a transaction
    mocks.buildBatch.mockImplementation(async ({ items }: { items: Item[] }) => {
      const transactions: string[][] = [];
      for (let i = 0; i < items.length; i += 2) transactions.push(items.slice(i, i + 2).map((item) => `ix-${item.position}`));
      return { deposits: [], transactions };
    });
  });

  it("reads every position and each market once, in two requests, and hands the SDK one batch in the order given", async () => {
    const positions = [
      { pda: key(1), market },
      { pda: key(2), market: owner },
      { pda: key(3), market },
    ];
    const batch = await buildBuyDepositBatch(rpc, owner, positions);
    expect(batch).toEqual({
      transactions: [[`ix-position-${key(1)}`, `ix-position-${key(2)}`], [`ix-position-${key(3)}`]],
      funded: [key(1), key(2), key(3)],
      skipped: [],
    });
    expect(mocks.fetchAllMaybePosition).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllMaybePosition.mock.calls[0][1]).toEqual(positions.map((p) => p.pda));
    // two positions share a market: it is read once
    expect(mocks.fetchAllMaybeMarket).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllMaybeMarket.mock.calls[0][1]).toEqual([market, owner]);
    expect(mocks.buildBatch).toHaveBeenCalledTimes(1);
    const args = mocks.buildBatch.mock.lastCall![0];
    expect(args).toMatchObject({ programId: "program", payer: owner });
    expect(args.owner.address).toBe(owner);
    expect(args.items.map((item: Item) => item.market)).toEqual([`market-${market}`, `market-${owner}`, `market-${market}`]);
    // no account is read one at a time, and no position is built on its own
    expect(mocks.fetchPosition).not.toHaveBeenCalled();
    expect(mocks.fetchMarket).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("reads more than a hundred positions a hundred at a time", async () => {
    const positions = Array.from({ length: 130 }, (_, n) => ({ pda: key(n), market }));
    const batch = await buildBuyDepositBatch(rpc, owner, positions);
    expect(batch.funded).toHaveLength(130);
    expect(batch.transactions).toHaveLength(65);
    expect(mocks.fetchAllMaybePosition.mock.calls.map(([, addresses]) => addresses.length)).toEqual([100, 30]);
    expect(mocks.fetchAllMaybeMarket).toHaveBeenCalledTimes(1);
  });

  it("funds a position named twice once, since the SDK refuses a batch that repeats one", async () => {
    const batch = await buildBuyDepositBatch(rpc, owner, [{ pda: key(1), market }, { pda: key(2), market }, { pda: key(1), market }]);
    expect(batch.funded).toEqual([key(1), key(2)]);
    expect(mocks.buildBatch.mock.lastCall![0].items).toHaveLength(2);
  });

  it("leaves out a position the chain will not take a deposit for, with the reason, and batches the others", async () => {
    // the second is already funded, the third's account is gone, the fourth's market is
    mocks.buildBatch.mockImplementation(async ({ items }: { items: Item[] }) => {
      if (items.some((item) => item.position === `position-${key(2)}`)) throw new Error(refusal);
      return { deposits: [], transactions: [items.map((item) => `ix-${item.position}`)] };
    });
    mocks.build.mockImplementation(async ({ position }: { position: string }) => {
      if (position === `position-${key(2)}`) throw new Error(refusal);
      return { ixs: [`ix-${position}`] };
    });
    mocks.fetchAllMaybePosition.mockImplementation(async (_rpc: unknown, addresses: string[]) =>
      addresses.map((a) => (a === key(3) ? { address: a, exists: false } : { address: a, exists: true, data: `position-${a}` })),
    );
    mocks.fetchAllMaybeMarket.mockImplementation(async (_rpc: unknown, addresses: string[]) =>
      addresses.map((a) => (a === owner ? { address: a, exists: false } : { address: a, exists: true, data: `market-${a}` })),
    );
    const batch = await buildBuyDepositBatch(rpc, owner, [
      { pda: key(1), market },
      { pda: key(2), market },
      { pda: key(3), market },
      { pda: key(4), market: owner },
      { pda: key(5), market },
      // a row that came without a usable market address is never sent to the RPC
      { pda: key(6), market: "" },
    ]);
    expect(batch).toEqual({
      transactions: [[`ix-position-${key(1)}`, `ix-position-${key(5)}`]],
      funded: [key(1), key(5)],
      skipped: [
        { pda: key(2), reason: refusal },
        { pda: key(3), reason: "position not found on chain" },
        { pda: key(4), reason: "market not found on chain" },
        { pda: key(6), reason: "position not found on chain" },
      ],
    });
    expect(mocks.fetchAllMaybePosition.mock.calls[0][1]).not.toContain(key(6));
    // the refused batch was asked again without the refused position
    expect(mocks.buildBatch).toHaveBeenCalledTimes(2);
  });

  it("returns no transactions when nothing can be funded, without asking the SDK for an empty batch", async () => {
    mocks.fetchAllMaybePosition.mockImplementation(async (_rpc: unknown, addresses: string[]) => addresses.map((a) => ({ address: a, exists: false })));
    const batch = await buildBuyDepositBatch(rpc, owner, [{ pda: key(1), market }]);
    expect(batch).toEqual({ transactions: [], funded: [], skipped: [{ pda: key(1), reason: "position not found on chain" }] });
    expect(mocks.buildBatch).not.toHaveBeenCalled();
  });

  it("passes on a batch failure that no single position explains", async () => {
    mocks.buildBatch.mockRejectedValue(new Error("deposit for X does not fit one transaction"));
    await expect(buildBuyDepositBatch(rpc, owner, [{ pda: key(1), market }])).rejects.toThrow(/does not fit one transaction/);
  });
});
