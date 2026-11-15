// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AccountRole, address, getAddressDecoder, type Instruction } from "@solana/kit";
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { packInstructionGroups, sendWalletTransactions, walletChange } from "./transaction";

const FEE_PAYER = "11111111111111111111111111111112";
const ix = (byte: number): Instruction => ({
  programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
  data: new Uint8Array([byte]),
});

function fakeRpc(simulationErr: unknown = null) {
  let sent = 0;
  const call = <T>(value: T) => ({ send: async () => value });
  return {
    getLatestBlockhash: vi.fn(() =>
      call({ value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 100n } }),
    ),
    simulateTransaction: vi.fn(() => call({ value: { err: simulationErr, logs: ["log"] } })),
    sendTransaction: vi.fn(() => call(`sig${sent++}`)),
    getSignatureStatuses: vi.fn((signatures: string[]) => call({ value: signatures.map(() => ({ confirmationStatus: "confirmed", err: null })) })),
    getBlockHeight: vi.fn(() => call(1n)),
  };
}

describe("sendWalletTransactions", () => {
  it("simulates, asks the wallet once and sends every transaction", async () => {
    const rpc = fakeRpc();
    const signAll = vi.fn(async (txs: VersionedTransaction[]) => txs);
    const signatures = await sendWalletTransactions({
      rpc: rpc as never,
      feePayer: FEE_PAYER,
      transactions: [[ix(1)], [ix(2)], [ix(3)]],
      signAllTransactions: signAll,
    });
    expect(signAll).toHaveBeenCalledTimes(1);
    expect(signAll.mock.calls[0][0]).toHaveLength(3);
    expect(rpc.getLatestBlockhash).toHaveBeenCalledTimes(1);
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(3);
    expect(signatures).toEqual(["sig0", "sig1", "sig2"]);
  });

  it("fails before the wallet prompt when a simulation fails", async () => {
    const rpc = fakeRpc({ InstructionError: [0, { Custom: 1 }] });
    const signAll = vi.fn(async (txs: VersionedTransaction[]) => txs);
    await expect(
      sendWalletTransactions({
        rpc: rpc as never,
        feePayer: FEE_PAYER,
        transactions: [[ix(1)], [ix(2)]],
        signAllTransactions: signAll,
      }),
    ).rejects.toThrow("simulation failed");
    expect(signAll).not.toHaveBeenCalled();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it.each(["message", "count", "binding"])("rejects changed %s before broadcast", async change => {
    const rpc = fakeRpc();
    let connected = true;
    await expect(sendWalletTransactions({
      rpc: rpc as never, feePayer: FEE_PAYER, transactions: [[ix(1)]],
      assertBinding: () => { if (!connected) throw new Error("Connection changed"); },
      signAllTransactions: async txs => {
        if (change === "message") txs[0].message.recentBlockhash = "11111111111111111111111111111112";
        if (change === "binding") connected = false;
        return change === "count" ? [] : txs;
      },
    })).rejects.toThrow();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it("tries a dropped simulation request again instead of failing the batch", async () => {
    const rpc = fakeRpc();
    rpc.simulateTransaction.mockImplementationOnce(() => ({ send: async () => { throw new Error("fetch failed"); } }) as never);
    const signAll = vi.fn(async (txs: VersionedTransaction[]) => txs);
    const signatures = await sendWalletTransactions({
      rpc: rpc as never,
      feePayer: FEE_PAYER,
      transactions: [[ix(1)], [ix(2)]],
      signAllTransactions: signAll,
    });
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(3);
    expect(signatures).toEqual(["sig0", "sig1"]);
  });

  it("keeps a large batch to a few requests at a time and confirms it with one status request", async () => {
    const rpc = fakeRpc();
    let running = 0;
    let peak = 0;
    rpc.simulateTransaction.mockImplementation(() => ({
      send: async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 2));
        running--;
        return { value: { err: null, logs: [] } };
      },
    }) as never);
    const transactions = Array.from({ length: 30 }, (_, i) => [ix(i)]);
    const signatures = await sendWalletTransactions({
      rpc: rpc as never,
      feePayer: FEE_PAYER,
      transactions,
      signAllTransactions: async (txs) => txs,
    });
    expect(signatures).toHaveLength(30);
    expect(peak).toBeLessThanOrEqual(4);
    expect(rpc.getSignatureStatuses).toHaveBeenCalledTimes(1);
    expect(rpc.getSignatureStatuses.mock.calls[0][0]).toHaveLength(30);
  });

  it("does nothing for an empty step", async () => {
    const rpc = fakeRpc();
    const signAll = vi.fn();
    await expect(
      sendWalletTransactions({ rpc: rpc as never, feePayer: FEE_PAYER, transactions: [], signAllTransactions: signAll }),
    ).resolves.toEqual([]);
    expect(signAll).not.toHaveBeenCalled();
    expect(rpc.getLatestBlockhash).not.toHaveBeenCalled();
  });
});

describe("sendWalletTransactions on a busy RPC", () => {
  it("sends again a transaction the RPC refused for rate, and says when sending begins", async () => {
    const rpc = fakeRpc();
    const limited = new Error("HTTP error (429): Too Many Requests");
    let refusals = 2;
    const send = rpc.sendTransaction.getMockImplementation()!;
    rpc.sendTransaction.mockImplementation((...args: unknown[]) =>
      refusals-- > 0 ? { send: async () => { throw limited; } } : (send as (...a: unknown[]) => { send: () => Promise<string> })(...args),
    );
    const order: string[] = [];
    const signatures = await sendWalletTransactions({
      rpc: rpc as never,
      feePayer: FEE_PAYER,
      transactions: [[ix(1)], [ix(2)]],
      signAllTransactions: async (txs) => {
        order.push("signed");
        return txs;
      },
      onSending: () => order.push("sending"),
    });
    expect(signatures).toEqual(["sig0", "sig1"]);
    // two refusals and two sends
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(4);
    expect(order).toEqual(["signed", "sending"]);
  }, 15_000);

  it("does not send again a transaction the RPC rejected", async () => {
    const rpc = fakeRpc();
    rpc.sendTransaction.mockImplementation(() => ({ send: async () => { throw new Error("Transaction simulation failed: Blockhash not found"); } }));
    await expect(
      sendWalletTransactions({ rpc: rpc as never, feePayer: FEE_PAYER, transactions: [[ix(1)]], signAllTransactions: async (txs) => txs }),
    ).rejects.toThrow("Blockhash not found");
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not say sending began when the wallet declines", async () => {
    const rpc = fakeRpc();
    const onSending = vi.fn();
    await expect(
      sendWalletTransactions({
        rpc: rpc as never,
        feePayer: FEE_PAYER,
        transactions: [[ix(1)]],
        signAllTransactions: async () => { throw new Error("User rejected the request"); },
        onSending,
      }),
    ).rejects.toThrow("rejected");
    expect(onSending).not.toHaveBeenCalled();
  });
});

describe("packInstructionGroups", () => {
  const key = (n: number) => getAddressDecoder().decode(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? n : i === 1 ? n >> 8 : 7)));
  // a deposit's shape: two instructions that belong together, over accounts no other group shares
  const group = (n: number): Instruction[] => [
    { programAddress: address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), accounts: [{ address: key(n * 4 + 1), role: AccountRole.WRITABLE }], data: new Uint8Array([1]) },
    {
      programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      accounts: [1, 2, 3].map((k) => ({ address: key(n * 4 + k), role: AccountRole.WRITABLE })),
      data: new Uint8Array([n]),
    },
  ];
  const groups = Array.from({ length: 12 }, (_, n) => group(n + 1));

  it("fills transactions with whole groups, in order, and keeps each under the limit", () => {
    const packed = packInstructionGroups(FEE_PAYER, groups);
    expect(packed.length).toBeGreaterThan(1);
    expect(packed.length).toBeLessThan(groups.length);
    expect(packed.flat()).toEqual(groups.flat());
    // whole groups only: every transaction holds an even number of instructions, starting with a group's first
    for (const transaction of packed) {
      expect(transaction.length % 2).toBe(0);
      expect(transaction[0].data).toEqual(new Uint8Array([1]));
    }
    // one more group would not have fitted the first transaction
    const perTransaction = packed[0].length / 2;
    expect(packInstructionGroups(FEE_PAYER, groups.slice(0, perTransaction))).toHaveLength(1);
    expect(packInstructionGroups(FEE_PAYER, groups.slice(0, perTransaction + 1))).toHaveLength(2);
  });

  it("gives a group too big for the limit a transaction of its own instead of dropping it", () => {
    const packed = packInstructionGroups(FEE_PAYER, groups.slice(0, 3), 10);
    expect(packed).toEqual(groups.slice(0, 3));
  });

  it("returns nothing for nothing, and one transaction for a single group", () => {
    expect(packInstructionGroups(FEE_PAYER, [])).toEqual([]);
    expect(packInstructionGroups(FEE_PAYER, [group(1)])).toEqual([group(1)]);
  });
});

describe("what a wallet may do to a transaction before signing it", () => {
  const LIGHTHOUSE = new PublicKey("L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95");
  const payer = new PublicKey(FEE_PAYER);
  const other = new PublicKey("SysvarRent111111111111111111111111111111111");
  /** The transaction as the wallet returns it, after `edit` had its way with the instructions. */
  const rebuilt = (tx: VersionedTransaction, edit: (message: TransactionMessage) => void): VersionedTransaction => {
    const message = TransactionMessage.decompile(tx.message);
    edit(message);
    return new VersionedTransaction(message.compileToV0Message());
  };
  const fees = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 })];
  const assertion = new TransactionInstruction({ programId: LIGHTHOUSE, keys: [{ pubkey: other, isSigner: false, isWritable: false }], data: Buffer.from([9, 9]) });
  const send = (signAllTransactions: (txs: VersionedTransaction[]) => Promise<VersionedTransaction[]>, rpc = fakeRpc()) =>
    sendWalletTransactions({ rpc: rpc as never, feePayer: FEE_PAYER, transactions: [[ix(1), ix(2)], [ix(3)]], signAllTransactions });

  it("sends what Phantom returns: a priority fee in front and its guard assertions behind", async () => {
    const rpc = fakeRpc();
    const signatures = await send(
      async (txs) =>
        txs.map((tx) =>
          rebuilt(tx, (message) => {
            message.instructions.unshift(...fees);
            message.instructions.push(assertion);
          }),
        ),
      rpc,
    );
    expect(signatures).toEqual(["sig0", "sig1"]);
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an instruction for any other program", (m: TransactionMessage) => void m.instructions.push(SystemProgram.transfer({ fromPubkey: payer, toPubkey: other, lamports: 1 })), /added instructions for 11111111111111111111111111111111/],
    ["one of its instructions removed", (m: TransactionMessage) => void m.instructions.pop(), /changed or removed/],
    ["one of its instructions altered", (m: TransactionMessage) => void (m.instructions[0] = new TransactionInstruction({ programId: m.instructions[0].programId, keys: [], data: Buffer.from([42]) })), /changed or removed/],
    ["its instructions out of order", (m: TransactionMessage) => void m.instructions.reverse(), /changed or removed/],
    ["another fee payer", (m: TransactionMessage) => void (m.payerKey = other), /fee payer changed/],
    ["another blockhash", (m: TransactionMessage) => void (m.recentBlockhash = "11111111111111111111111111111112"), /blockhash changed/],
    ["a second signer", (m: TransactionMessage) => void m.instructions.push(new TransactionInstruction({ programId: LIGHTHOUSE, keys: [{ pubkey: other, isSigner: true, isWritable: false }], data: Buffer.from([1]) })), /signers changed/],
  ])("does not send a transaction that comes back with %s", async (_name, edit, reason) => {
    const rpc = fakeRpc();
    // only the first transaction is touched: one bad one stops them all
    await expect(send(async (txs) => [rebuilt(txs[0], edit), ...txs.slice(1)], rpc)).rejects.toThrow(reason);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it("finds nothing to object to in an untouched transaction, and names what it objects to", async () => {
    let original: VersionedTransaction | undefined;
    await send(async (txs) => {
      original = VersionedTransaction.deserialize(txs[0].serialize());
      return txs;
    });
    expect(walletChange(original!.message, original!.message)).toBeNull();
    expect(walletChange(original!.message, rebuilt(original!, (m) => void m.instructions.unshift(...fees)).message)).toBeNull();
    expect(walletChange(original!.message, rebuilt(original!, (m) => void m.instructions.pop()).message)).toBe("an instruction was changed or removed");
  });
});
