import { afterEach, describe, expect, it, vi } from "vitest";
import { getActaProgramId, getPriceRouteEncoder } from "@acta-markets/ts-sdk";
import { findVaultPda, flows, priceRouteState, pythBrick, pythPriceFeedAccount } from "@acta-markets/ts-sdk/chain";
import {
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getAddressDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Instruction,
  type Rpc,
  type SolanaRpcApiMainnet,
} from "@solana/kit";
import { buildSelfProcessWithdrawInstructions } from "./depositor";
import {
  buildCapitalStepTransactions,
  capitalBatchComputeUnits,
  createVaultManager,
  withComputeUnitLimit,
} from "./operator";
import type { Vault } from "./types";

const USER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const FEED = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const MAIN_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SECOND_MINT = "So11111111111111111111111111111111111111112";

async function testVault(overrides: Partial<Vault> = {}): Promise<Vault> {
  return {
    vault_pda: await findVaultPda({ vaultId: new Uint8Array(32).fill(1) }),
    vault_id: "01".repeat(32),
    governance: USER,
    primary_delegate: USER,
    main_mint: MAIN_MINT,
    second_mint: SECOND_MINT,
    share_mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    main_token_program: "legacy_spl",
    second_token_program: "legacy_spl",
    phase: "idle",
    safety: "normal",
    equity_computed: false,
    accepting_deposits: false,
    pending_deposit_count: 0,
    pending_withdraw_count: 0,
    pending_withdraw_shares: "0", total_shares: "1000", live_share_supply: null, staging: null,
    ...overrides,
  } as Vault;
}

const users = (n: number) =>
  Array.from({ length: n }, (_, i) => getAddressDecoder().decode(new Uint8Array(32).fill(i + 10)));

function page(requests: object[]) {
  return new Response(JSON.stringify({ requests, next_cursor: null }), { status: 200 });
}

/** Serves the vault's main then second price route, each one Pyth brick on `FEED`. */
function stubRpc(supply: bigint): Rpc<SolanaRpcApiMainnet> {
  const account = (mint: string) => {
    const route = new Uint8Array(
      getPriceRouteEncoder().encode(priceRouteState({ mint: address(mint), bump: 255, maxSkewSecs: 10, bricks: [pythBrick(FEED, 60)] })),
    );
    return {
      data: [Buffer.from(route).toString("base64"), "base64"],
      executable: false,
      lamports: 1n,
      owner: getActaProgramId(),
      space: BigInt(route.length),
    };
  };
  const send = (value: unknown) => ({ send: async () => ({ context: { slot: 1n }, value }) });
  return {
    getMultipleAccounts: (keys: unknown[]) => send(keys.map((_, i) => account(i % 2 === 0 ? MAIN_MINT : SECOND_MINT))),
    getTokenSupply: () => send({ amount: supply.toString(), decimals: 6, uiAmountString: "0" }),
  } as unknown as Rpc<SolanaRpcApiMainnet>;
}

function wireSize(instructions: Instruction[]): number {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(USER), m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: blockhash("11111111111111111111111111111111"), lastValidBlockHeight: 0n },
        m,
      ),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return getTransactionEncoder().encode(compileTransaction(message)).length;
}

describe("vault operator", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prefixes a SetComputeUnitLimit instruction", () => {
    const [budget] = withComputeUnitLimit([], 493_600);
    expect(budget.programAddress).toBe("ComputeBudget111111111111111111111111111111");
    expect(Array.from(budget.data ?? [])).toEqual([2, 0x20, 0x88, 0x07, 0x00]);
    expect(capitalBatchComputeUnits(3)).toBe(380_200);
    expect(capitalBatchComputeUnits(9)).toBe(380_200);
  });

  it("batches pending deposits into packet-sized transactions", async () => {
    const vault = await testVault({ phase: "processing_capital", equity_computed: true, pending_deposit_count: 5 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page(users(5).map((wallet) => ({ wallet, amount: "1", created_at: "0", transaction_signature: null })))));
    const manager = await createVaultManager(vault, USER);
    const txs = await buildCapitalStepTransactions("process_deposits", { rpc: stubRpc(0n), manager, vault });
    expect(txs).toHaveLength(2);
    expect(new DataView(txs[0][0].data!.buffer).getUint32(1, true)).toBe(capitalBatchComputeUnits(3));
    expect(new DataView(txs[1][0].data!.buffer).getUint32(1, true)).toBe(capitalBatchComputeUnits(2));
    for (const tx of txs) expect(wireSize(tx)).toBeLessThanOrEqual(1232);
  });

  it("splits withdrawals into packet-sized transactions", async () => {
    const vault = await testVault({ phase: "processing_capital", equity_computed: true, pending_withdraw_count: 4 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page(users(4).map((wallet) => ({ wallet, shares: "1", created_at: "0", transaction_signature: null })))));
    const manager = await createVaultManager(vault, USER);
    const txs = await buildCapitalStepTransactions("process_withdrawals", { rpc: stubRpc(100n), manager, vault });
    expect(txs).toHaveLength(2);
    for (const tx of txs) expect(wireSize(tx)).toBeLessThanOrEqual(1232);
  });

  it("holds the final redemption while deposits are pending", async () => {
    const request = { wallet: USER, shares: "100", created_at: "0", transaction_signature: null };
    const manager = await createVaultManager(await testVault(), USER);
    for (const [pending, expected] of [[1, 0], [0, 1]] as const) {
      const vault = await testVault({ equity_computed: true, pending_withdraw_count: 1, pending_deposit_count: pending });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page([request])));
      const txs = await buildCapitalStepTransactions("process_withdrawals", { rpc: stubRpc(100n), manager, vault });
      expect(txs).toHaveLength(expected);
    }
  });

  it("prices an unpriced idle vault before a self-processed withdrawal", async () => {
    const vault = await testVault({ pending_withdraw_count: 1 });
    const manager = await createVaultManager(vault, USER);
    const ixs = await buildSelfProcessWithdrawInstructions(stubRpc(0n), manager, vault);
    const priceUpdate = await pythPriceFeedAccount(FEED);
    expect(ixs).toHaveLength(3);
    expect(ixs[1].accounts?.some((a) => a.address === priceUpdate)).toBe(true);
    expect(ixs[2]).toEqual(await manager.processWithdrawals([address(USER)]));

    const priced = await buildSelfProcessWithdrawInstructions(stubRpc(0n), manager, { ...vault, equity_computed: true });
    expect(priced).toHaveLength(1);
  });

  it.each([false, true])("builds the final withdrawal against live supply (priced=%s)", async priced => {
    const vault = await testVault({ equity_computed: priced, pending_withdraw_count: 1,
      total_shares: "1000", live_share_supply: "900", pending_withdraw_shares: "900" });
    const manager = await createVaultManager(vault, USER);
    const ixs = await buildSelfProcessWithdrawInstructions(stubRpc(900n), manager, vault);
    expect(ixs).toHaveLength(priced ? 1 : 3);
    expect(ixs.at(-1)).toEqual(await manager.processFinalWithdrawal(address(USER)));
    expect(wireSize(ixs)).toBeLessThanOrEqual(1232);
  });

  it("does not build a final withdrawal with pending deposits or staging", async () => {
    const vault = await testVault({ equity_computed: true, pending_withdraw_count: 1,
      total_shares: "1000", live_share_supply: "900", pending_withdraw_shares: "900" });
    const manager = await createVaultManager(vault, USER);
    await expect(buildSelfProcessWithdrawInstructions(stubRpc(900n), manager, { ...vault, pending_deposit_count: 1 })).rejects.toThrow("pending");
    await expect(buildSelfProcessWithdrawInstructions(stubRpc(900n), manager, { ...vault, staging: {} as Vault["staging"] })).rejects.toThrow("staged");
    const partial = await buildSelfProcessWithdrawInstructions(stubRpc(900n), manager, { ...vault, pending_withdraw_shares: "899" });
    expect(partial).toEqual([await manager.processWithdrawals([address(USER)])]);
  });

  it("returns SDK next steps for the dashboard", () => {
    const clock = flows.windowClock(false, 0, 1);
    const policy = { reopen: false, depositWindowMs: 1, tradingWindowMs: 1 };
    expect(flows.nextCapitalStep({ phase: "idle", safety: "normal", equity_computed: false, accepting_deposits: false, pending_deposit_count: 0, pending_withdraw_count: 1, staging: null }, clock, policy)).toBe("compute_equity");
  });
});
