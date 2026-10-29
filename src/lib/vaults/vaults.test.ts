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
import { formatUnits, mainToShares, parseUnits, sharesToMain } from "./math";
import { makeVault } from "./sample";
import type { Vault } from "./types";

const USER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function vault(overrides: Partial<Vault> = {}): Vault {
  return makeVault({
    vault_pda: "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
    governance: USER,
    fee_recipient: USER,
    primary_delegate: USER,
    second_mint: NATIVE_MINT,
    share_mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    total_shares: "1000000",
    equity: "1000000",
    capital_fallback_delay_secs: "3600",
    ...overrides,
  });
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
