import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchPosition: vi.fn(), fetchMarket: vi.fn(), build: vi.fn() }));
vi.mock("@acta-markets/ts-sdk", () => ({ fetchPosition: mocks.fetchPosition, fetchMarket: mocks.fetchMarket }));
vi.mock("@acta-markets/ts-sdk/chain", () => ({
  flows: { buildDepositFundsIxs: mocks.build },
  getActaProgramId: () => "program",
}));

import { buildBuyDepositInstructions } from "./buy-deposit";

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
