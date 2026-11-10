import { afterEach, describe, expect, it, vi } from "vitest";
import { getGlobalConfigEncoder } from "@acta-markets/ts-sdk";
import { findGlobalConfigPda, flows, getActaProgramId } from "@acta-markets/ts-sdk/chain";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getAddressDecoder,
  getAddressEncoder,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type AddressesByLookupTableAddress,
  type Blockhash,
} from "@solana/kit";
import { graftWalletSignatures } from "./sponsored-tx";
import type { resolveKeeper } from "./sponsored-tx";

type Rpc = Parameters<typeof resolveKeeper>[0];

const LOOKUP_TABLE_PROGRAM = "AddressLookupTab1e1111111111111111111111111" as Address;
const ACTIVE = 0xffff_ffff_ffff_ffffn;
const key = (byte: number) => getAddressDecoder().decode(new Uint8Array(32).fill(byte));
const [payer, program, staticAccount, writable, readonly, unused] = [1, 2, 3, 4, 5, 6].map(key);
const [tableA, tableB] = [7, 8].map(key);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return import("./sponsored-tx");
}

function servedTx(tables: AddressesByLookupTableAddress = { [tableA]: [unused, writable], [tableB]: [readonly] }) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: "11111111111111111111111111111111" as Blockhash, lastValidBlockHeight: 0n },
      m,
    ),
    (m) => appendTransactionMessageInstruction({
      programAddress: program,
      accounts: [
        { address: staticAccount, role: AccountRole.WRITABLE },
        { address: writable, role: AccountRole.WRITABLE },
        { address: readonly, role: AccountRole.READONLY },
      ],
    }, m),
    (m) => compressTransactionMessageUsingAddressLookupTables(m, tables),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

function tableAccount(
  addresses: Address[],
  { owner = LOOKUP_TABLE_PROGRAM, state = 1, deactivationSlot = ACTIVE, size = 56 + addresses.length * 32 } = {},
) {
  const data = new Uint8Array(size);
  const view = new DataView(data.buffer);
  view.setUint32(0, state, true);
  if (size >= 12) view.setBigUint64(4, deactivationSlot, true);
  addresses.forEach((address, index) => data.set(getAddressEncoder().encode(address), 56 + index * 32));
  return { owner, data: [getBase64Decoder().decode(data), "base64"], executable: false, lamports: 1n, space: BigInt(size) };
}

function tableRpc(accounts: Record<string, unknown>) {
  const getMultipleAccounts = vi.fn((keys: Address[], _config: unknown) => ({
    send: async () => ({ context: { slot: 1n }, value: keys.map((table) => accounts[table] ?? null) }),
  }));
  return { rpc: { getMultipleAccounts } as unknown as Rpc, getMultipleAccounts };
}

function globalConfig(hotAuthority: Address) {
  const data = getGlobalConfigEncoder().encode({
    discriminator: 6,
    version: 1,
    bump: 255,
    flags: 0,
    pad0: new Uint8Array(4),
    hotAuthority,
    timelockSecs: 0n,
    guardian: key(20),
    settlementAttestor: key(0),
    settlementAttestationDomain: new Uint8Array(32),
    reserved: Array(19).fill(0n),
  });
  return {
    owner: getActaProgramId(),
    data: [getBase64Decoder().decode(data), "base64"],
    executable: false,
    lamports: 1n,
    space: BigInt(data.length),
  };
}

function configRpc(...authorities: Address[]) {
  const getAccountInfo = vi.fn((_address: Address, _config: unknown) => {
    const hotAuthority = authorities[Math.min(getAccountInfo.mock.calls.length - 1, authorities.length - 1)]!;
    return { send: async () => ({ context: { slot: 1n }, value: globalConfig(hotAuthority) }) };
  });
  return { rpc: { getAccountInfo } as unknown as Rpc, getAccountInfo };
}

describe("resolveKeeper", () => {
  const keeper = key(30);
  const rotated = key(31);

  it("reads the GlobalConfig hot authority at the canonical PDA", async () => {
    const { resolveKeeper } = await load();
    const { rpc, getAccountInfo } = configRpc(keeper);
    await expect(resolveKeeper(rpc)).resolves.toBe(keeper);
    expect(getAccountInfo).toHaveBeenCalledExactlyOnceWith(
      await findGlobalConfigPda(),
      expect.objectContaining({ commitment: "confirmed", encoding: "base64" }),
    );
  });

  it("shares one read between concurrent and repeated resolves within the TTL", async () => {
    const { resolveKeeper } = await load();
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const { rpc, getAccountInfo } = configRpc(keeper, rotated);
    const [first, second] = await Promise.all([resolveKeeper(rpc), resolveKeeper(rpc)]);
    clock.mockReturnValue(1_029_999);
    expect([first, second, await resolveKeeper(rpc)]).toEqual([keeper, keeper, keeper]);
    expect(getAccountInfo).toHaveBeenCalledOnce();
  });

  it("rereads the hot authority once the TTL lapses", async () => {
    const { resolveKeeper } = await load();
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const { rpc, getAccountInfo } = configRpc(keeper, rotated);
    await expect(resolveKeeper(rpc)).resolves.toBe(keeper);
    clock.mockReturnValue(1_030_000);
    await expect(resolveKeeper(rpc)).resolves.toBe(rotated);
    expect(getAccountInfo).toHaveBeenCalledTimes(2);
  });

  it("caches per network", async () => {
    const { resolveKeeper } = await load();
    const { rpc, getAccountInfo } = configRpc(keeper, rotated);
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "devnet");
    await expect(resolveKeeper(rpc)).resolves.toBe(keeper);
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "mainnet");
    await expect(resolveKeeper(rpc)).resolves.toBe(rotated);
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "devnet");
    await expect(resolveKeeper(rpc)).resolves.toBe(keeper);
    expect(getAccountInfo).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed read", async () => {
    const { resolveKeeper } = await load();
    const getAccountInfo = vi.fn()
      .mockReturnValueOnce({ send: async () => { throw new Error("rpc down"); } })
      .mockReturnValueOnce({ send: async () => ({ context: { slot: 1n }, value: globalConfig(keeper) }) });
    const rpc = { getAccountInfo } as unknown as Rpc;
    await expect(resolveKeeper(rpc)).rejects.toThrow("rpc down");
    await expect(resolveKeeper(rpc)).resolves.toBe(keeper);
  });

  it("rejects a missing GlobalConfig", async () => {
    const { resolveKeeper } = await load();
    const rpc = { getAccountInfo: () => ({ send: async () => ({ context: { slot: 1n }, value: null }) }) } as unknown as Rpc;
    await expect(resolveKeeper(rpc)).rejects.toThrow();
  });
});

describe("resolveLookupTables", () => {
  it("reads every table the served v0 message names from chain", async () => {
    const { resolveLookupTables } = await load();
    const chain = { [tableA]: [unused, writable, key(40)], [tableB]: [readonly] };
    const { rpc, getMultipleAccounts } = tableRpc({
      [tableA]: tableAccount(chain[tableA]),
      [tableB]: tableAccount(chain[tableB]),
    });
    await expect(resolveLookupTables(rpc, servedTx())).resolves.toEqual(chain);
    expect(getMultipleAccounts).toHaveBeenCalledOnce();
    const [keys, config] = getMultipleAccounts.mock.calls[0]!;
    expect([...keys].sort()).toEqual([tableA, tableB].sort());
    expect(config).toEqual({ encoding: "base64", commitment: "confirmed" });
  });

  it("skips the RPC for a message without lookups", async () => {
    const { resolveLookupTables } = await load();
    const { rpc, getMultipleAccounts } = tableRpc({});
    await expect(resolveLookupTables(rpc, servedTx({}))).resolves.toEqual({});
    expect(getMultipleAccounts).not.toHaveBeenCalled();
  });

  it("rejects a table the chain does not have", async () => {
    const { resolveLookupTables } = await load();
    const { rpc } = tableRpc({ [tableA]: tableAccount([unused, writable]) });
    const error = await resolveLookupTables(rpc, servedTx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(flows.VaultIntentError);
    expect((error as flows.VaultIntentError).mismatch).toEqual({ kind: "missingLookupTable", table: tableB });
  });

  it.each([
    ["deactivated", tableAccount([readonly], { deactivationSlot: 123n }), "is deactivated"],
    ["owned by another program", tableAccount([readonly], { owner: program }), "is not an address lookup table"],
    ["uninitialized", tableAccount([readonly], { state: 0 }), "is not initialized"],
    ["truncated", tableAccount([], { size: 40 }), "is malformed"],
    ["misaligned", tableAccount([], { size: 56 + 31 }), "is malformed"],
  ])("rejects a table that is %s", async (_name, account, reason) => {
    const { resolveLookupTables } = await load();
    const { rpc } = tableRpc({ [tableA]: tableAccount([unused, writable]), [tableB]: account });
    const error = await resolveLookupTables(rpc, servedTx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(flows.VaultIntentError);
    expect((error as Error).message).toContain(`lookup table ${tableB} ${reason}`);
  });

  it("reports an RPC failure without blaming the served transaction", async () => {
    const { resolveLookupTables } = await load();
    const rpc = { getMultipleAccounts: () => ({ send: async () => { throw new Error("timeout"); } }) } as unknown as Rpc;
    const error = await resolveLookupTables(rpc, servedTx()).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(flows.VaultIntentError);
    expect((error as Error).message).toBe("Unable to read lookup tables: timeout");
  });
});

describe("graftWalletSignatures", () => {
  const sig = (fill: number) => new Uint8Array(64).fill(fill);

  it("writes the wallet signatures over the served slots without touching the message", () => {
    const message = new Uint8Array([0x80, 0x01, 0x02, 0x03]);
    const served = new Uint8Array([1, ...sig(0), ...message]); // one signature slot
    const grafted = graftWalletSignatures(served, [sig(9)]);
    expect(Array.from(grafted.slice(1, 65))).toEqual(Array.from(sig(9)));
    expect(Array.from(grafted.slice(65))).toEqual(Array.from(message));
  });

  it("rejects a wallet that signed a different number of slots", () => {
    const served = new Uint8Array([1, ...sig(0), 0x00]);
    expect(() => graftWalletSignatures(served, [])).toThrow(/signed 0 of 1/);
  });

  it("rejects an empty signature", () => {
    const served = new Uint8Array([1, ...sig(0), 0x00]);
    expect(() => graftWalletSignatures(served, [null])).toThrow(/left a signature empty/);
  });
});
