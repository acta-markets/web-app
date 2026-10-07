import { describe, expect, it, vi } from "vitest";
import { address, type Instruction } from "@solana/kit";
import type { VersionedTransaction } from "@solana/web3.js";
import { sendWalletTransactions } from "./transaction";

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
    getSignatureStatuses: vi.fn(() => call({ value: [{ confirmationStatus: "confirmed", err: null }] })),
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
