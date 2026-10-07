import { afterEach, describe, expect, it, vi } from "vitest";
import { getOracleSourceEncoder } from "@acta-markets/ts-sdk";
import { findVaultPda, flows, pythPriceFeedAccount } from "@acta-markets/ts-sdk/chain";
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

async function testVault(overrides: Partial<Vault> = {}): Promise<Vault> {
  return {
    vault_pda: await findVaultPda({ vaultId: new Uint8Array(32).fill(1) }),
    vault_id: "01".repeat(32),
    governance: USER,
    primary_delegate: USER,
    main_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    second_mint: "So11111111111111111111111111111111111111112",
    share_mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    main_token_program: "legacy_spl",
    second_token_program: "legacy_spl",
    phase: "idle",
    safety: "normal",
    equity_computed: false,
    accepting_deposits: false,
    pending_deposit_count: 0,
    pending_withdraw_count: 0,
    ...overrides,
  } as Vault;
}

const users = (n: number) =>
  Array.from({ length: n }, (_, i) => getAddressDecoder().decode(new Uint8Array(32).fill(i + 10)));

function page(requests: object[]) {
  return new Response(JSON.stringify({ requests, next_cursor: null }), { status: 200 });
}

function stubRpc(supply: bigint): Rpc<SolanaRpcApiMainnet> {
  const oracle = new Uint8Array(
    getOracleSourceEncoder().encode({
      discriminator: 0,
      version: 1,
      bump: 255,
      pad0: new Uint8Array(5),
      mint: address(USER),
      feeds: Uint8Array.from({ length: 128 }, (_, i) => (i >= 32 && i < 64 ? FEED[i - 32] : 0)),
      reserved: new Array(32).fill(0),
    }),
  );
  const account = {
    data: [Buffer.from(oracle).toString("base64"), "base64"],
    executable: false,
    lamports: 1n,
    owner: USER,
    space: BigInt(oracle.length),
  };
  const send = (value: unknown) => ({ send: async () => ({ context: { slot: 1n }, value }) });
  return {
    getMultipleAccounts: (keys: unknown[]) => send(keys.map(() => account)),
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

  it("returns SDK next steps for the dashboard", () => {
    const clock = flows.windowClock(false, 0, 1);
    const policy = { reopen: false, depositWindowMs: 1, tradingWindowMs: 1 };
    expect(flows.nextCapitalStep({ phase: "idle", safety: "normal", equity_computed: false, accepting_deposits: false, pending_deposit_count: 0, pending_withdraw_count: 1 }, clock, policy)).toBe("compute_equity");
  });
});
