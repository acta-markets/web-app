import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_PROGRAM_ID, findVaultPda } from "@acta-markets/ts-sdk/chain";
import { fetchVaults } from "./api";
import {
  buildCancelDepositInstructions,
  buildRequestDepositInstructions,
  buildSelfProcessDepositInstructions,
  createVaultDepositor,
  NATIVE_MINT,
} from "./depositor";
import { createVaultManager } from "./operator";
import { depositCapacity, formatUnits, mainToShares, parseUnits, sharesToMain } from "./math";
import {
  cancelDepositBlock,
  cancelWithdrawBlock,
  refundDepositBlock,
  requestDepositBlock,
  requestWithdrawBlock,
  selfProcessDepositBlock,
  selfProcessWithdrawBlock,
} from "./rules";
import type { Vault } from "./types";

const USER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function vault(overrides: Partial<Vault> = {}): Vault {
  return {
    vault_pda: "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
    vault_id: "00".repeat(32),
    governance: USER,
    fee_recipient: USER,
    primary_delegate: USER,
    main_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    second_mint: NATIVE_MINT,
    share_mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    main_token_program: "legacy_spl",
    second_token_program: "legacy_spl",
    main_decimals: 6,
    second_decimals: 9,
    phase: "idle",
    safety: "normal",
    capabilities: 0,
    active_expiry: "0",
    open_positions: "0",
    total_shares: "1000000",
    share_price: "1000000000",
    equity: "1000000",
    capital_generation: "0",
    accepting_deposits: true,
    equity_computed: false,
    pending_deposit_count: 0,
    pending_withdraw_count: 0,
    pending_deposit_amount: "0",
    pending_withdraw_shares: "0",
    performance_fee_bps: 1000,
    management_fee_bps: 200,
    manager_stake_min_bps: 100,
    share_price_hwm: "1000000000",
    last_hwm_update_ts: "0",
    last_hwm_reset_ts: "0",
    last_settlement_ts: "0",
    cap_limit: "0",
    capital_fallback_delay_secs: "3600",
    deposit_window_set_ts: null,
    main_balance: null,
    second_balance: null,
    balance_updated_at: null,
    live_share_supply: null,
    observed_manager_stake_shares: null,
    balance_chain_slot: null,
    policy: {
      max_open_positions: 4,
      max_rebalance_drift_bps: 100,
      min_main_liquidity_bps: 1000,
    },
    projection: { version: "1", slot: "1", transaction_index: 0, signature: "sig", event_index: 0 },
    performance: { status: "no_track_record" },
    ...overrides,
  };
}

describe("vault math", () => {
  it("parses and formats base units", () => {
    expect(parseUnits("1.5", 6)).toBe(1_500_000n);
    expect(parseUnits(".25", 2)).toBe(25n);
    expect(parseUnits("1.1234567", 6)).toBeNull();
    expect(parseUnits("abc", 6)).toBeNull();
    expect(parseUnits("", 6)).toBeNull();
    expect(formatUnits(1_500_000n, 6)).toBe("1.5");
    expect(formatUnits(1_234_567n, 6, 2)).toBe("1.23");
    expect(formatUnits(2_000_000n, 6)).toBe("2");
  });

  it("converts shares at the scaled price", () => {
    expect(sharesToMain(2_000_000n, 1_500_000_000n)).toBe(3_000_000n);
    expect(mainToShares(3_000_000n, 1_500_000_000n)).toBe(2_000_000n);
    expect(mainToShares(1n, 0n)).toBe(0n);
  });

  it("measures capacity against equity plus pending deposits", () => {
    expect(depositCapacity(vault())).toBeNull();
    expect(depositCapacity(vault({ cap_limit: "5000000", pending_deposit_amount: "1000000" }))).toBe(3_000_000n);
    expect(depositCapacity(vault({ cap_limit: "1000000", pending_deposit_amount: "1" }))).toBe(0n);
  });
});

describe("vault request rules", () => {
  const now = 1_000;

  it("deposits only while intake is open", () => {
    expect(requestDepositBlock(vault(), now)).toBeNull();
    expect(requestDepositBlock(vault({ accepting_deposits: false }), now)).toBe("window_closed");
    expect(requestDepositBlock(vault({ phase: "active", active_expiry: "2000", accepting_deposits: false }), now)).toBeNull();
    expect(requestDepositBlock(vault({ phase: "active", active_expiry: "1000" }), now)).toBe("cutoff");
    expect(requestDepositBlock(vault({ phase: "settling" }), now)).toBe("phase");
    expect(requestDepositBlock(vault({ safety: "frozen" }), now)).toBe("safety");
  });

  it("cancels outside the priced boundary and terminal modes", () => {
    expect(cancelDepositBlock(vault({ safety: "frozen" }), now)).toBeNull();
    expect(cancelDepositBlock(vault({ equity_computed: true, accepting_deposits: false }), now)).toBe("priced");
    expect(cancelDepositBlock(vault({ safety: "withdraw_only" }), now)).toBe("safety");
    expect(cancelDepositBlock(vault({ phase: "processing_capital" }), now)).toBe("phase");
  });

  it("refunds deposits only in emergency unwind", () => {
    expect(refundDepositBlock(vault({ safety: "emergency_unwind" }))).toBeNull();
    expect(refundDepositBlock(vault({ safety: "closing" }))).toBe("safety");
  });

  it("lets withdrawals through closing in any phase", () => {
    expect(requestWithdrawBlock(vault({ safety: "closing", phase: "settling" }), now)).toBeNull();
    expect(cancelWithdrawBlock(vault({ safety: "closing", phase: "settling" }), now)).toBeNull();
    expect(requestWithdrawBlock(vault({ safety: "withdraw_only" }), now)).toBeNull();
    expect(cancelWithdrawBlock(vault({ safety: "withdraw_only" }), now)).toBe("safety");
    expect(requestWithdrawBlock(vault({ safety: "emergency_unwind" }), now)).toBe("safety");
    expect(requestWithdrawBlock(vault({ phase: "active", active_expiry: "999" }), now)).toBe("cutoff");
  });
});

describe("vault self-processing rules", () => {
  it("refunds deposits publicly in closing and withdraw-only", () => {
    expect(selfProcessDepositBlock(vault({ safety: "closing", phase: "settling" }), 0n, 10)).toBeNull();
    expect(selfProcessDepositBlock(vault({ safety: "withdraw_only" }), 0n, 10)).toBeNull();
    expect(selfProcessDepositBlock(vault({ safety: "emergency_unwind" }), 0n, 10_000)).toBe("safety");
  });

  it("opens normal deposit processing only after the fallback delay", () => {
    const priced = vault({ equity_computed: true, accepting_deposits: false });
    expect(selfProcessDepositBlock(priced, 100n, 3_699)).toBe("authority");
    expect(selfProcessDepositBlock(priced, 100n, 3_700)).toBeNull();
    expect(selfProcessDepositBlock(vault(), 100n, 3_700)).toBe("window_closed");
    const processing = vault({ phase: "processing_capital", equity_computed: true, active_expiry: "1000" });
    expect(selfProcessDepositBlock(processing, 0n, 4_599)).toBe("authority");
    expect(selfProcessDepositBlock(processing, 0n, 4_600)).toBeNull();
  });

  it("processes withdrawals publicly in idle withdraw-only", () => {
    expect(selfProcessWithdrawBlock(vault({ safety: "withdraw_only" }), 0n, 10)).toBeNull();
    expect(selfProcessWithdrawBlock(vault({ safety: "closing" }), 0n, 10)).toBe("safety");
    expect(selfProcessWithdrawBlock(vault(), 0n, 10_000)).toBe("unpriced");
    expect(selfProcessWithdrawBlock(vault({ phase: "processing_capital" }), 0n, 10_000)).toBe("phase");
    expect(selfProcessWithdrawBlock(vault({ safety: "emergency_unwind" }), 0n, 10_000)).toBe("safety");
  });
});

describe("vault api", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the configured backend through the SDK client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ vaults: [vault()] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchVaults()).resolves.toHaveLength(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v1\/vaults$/);
  });
});

describe("vault depositor instructions", () => {
  it("requests a deposit without wrapping for SPL vaults", async () => {
    const depositor = await createVaultDepositor(vault(), USER);
    const ixs = await buildRequestDepositInstructions(depositor, 5n);
    expect(ixs).toHaveLength(1);
    expect(ixs[0].programAddress).toBe(depositor.programAddress);
  });

  it("wraps SOL before the request and unwraps after cancel", async () => {
    const depositor = await createVaultDepositor(vault({ main_mint: NATIVE_MINT, main_decimals: 9 }), USER);
    const ata = depositor.addresses.userMainAta;
    const deposit = await buildRequestDepositInstructions(depositor, 5n, 3n);
    expect(deposit).toHaveLength(4);
    expect(deposit[2]).toMatchObject({ programAddress: TOKEN_PROGRAM_ID, data: Uint8Array.of(17) });
    expect(deposit[2].accounts?.[0].address).toBe(ata);

    const cancel = buildCancelDepositInstructions(depositor, true);
    expect(cancel).toHaveLength(2);
    expect(cancel[1]).toMatchObject({ programAddress: TOKEN_PROGRAM_ID, data: Uint8Array.of(9) });
    expect(cancel[1].accounts?.map((a) => a.address)).toEqual([ata, USER, USER]);
  });

  it("self-processes only the user's own deposit and unwraps SOL", async () => {
    const base = vault({
      vault_id: "01".repeat(32),
      main_mint: NATIVE_MINT,
      main_decimals: 9,
      second_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });
    const derived = await createVaultManager({ ...base, vault_pda: "11111111111111111111111111111111" }, USER).catch(
      (err: Error) => err,
    );
    expect(derived).toBeInstanceOf(Error);
    const pda = await findVaultPda({ vaultId: new Uint8Array(32).fill(1) });
    const processor = await createVaultManager({ ...base, vault_pda: pda }, USER);
    const ixs = await buildSelfProcessDepositInstructions(processor, true);
    expect(ixs).toHaveLength(2);
    expect(ixs[0].accounts?.some((a) => a.address === USER)).toBe(true);
    expect(ixs[1]).toMatchObject({ programAddress: TOKEN_PROGRAM_ID, data: Uint8Array.of(9) });
  });
});
