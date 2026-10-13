import { describe, expect, it } from "vitest";
import { contractErrorCode, describeVaultTxError } from "./tx-errors";
import { TransactionFailedError } from "./transaction";

describe("contractErrorCode", () => {
  it("reads simulation logs and confirmation statuses", () => {
    expect(contractErrorCode("Program X failed: custom program error: 0x467")).toBe(1127);
    expect(contractErrorCode('transaction failed: {"InstructionError":[0,{"Custom":1142}]}')).toBe(1142);
    expect(contractErrorCode("nothing here")).toBeNull();
  });
});

describe("describeVaultTxError", () => {
  it("treats a wallet rejection as information, not failure", () => {
    expect(describeVaultTxError(Object.assign(new Error("whatever"), { code: 4001 }))).toEqual({
      tone: "info",
      message: "Request declined in your wallet. Nothing was sent.",
    });
    expect(describeVaultTxError(new Error("User rejected the request."))).toMatchObject({ tone: "info" });
  });

  it("maps known contract errors from simulation", () => {
    const view = describeVaultTxError(
      new Error("simulation failed: Program log: Instruction: RequestDeposit\nProgram X failed: custom program error: 0x467"),
    );
    expect(view).toEqual({
      tone: "error",
      message: "You already have a pending request of this kind. Cancel it first. Nothing was sent.",
    });
  });

  it("calls out a short balance during simulation", () => {
    expect(describeVaultTxError(new Error("simulation failed: Transfer: insufficient lamports 10, need 20")).message).toMatch(
      /^Not enough balance/,
    );
    expect(describeVaultTxError(new Error("simulation failed: ")).message).toBe(
      "The transaction failed in simulation. Nothing was sent.",
    );
  });

  it("keeps the signature when a sent transaction fails or expires", () => {
    expect(
      describeVaultTxError(new TransactionFailedError("sig1", 'transaction failed: {"InstructionError":[0,{"Custom":1142}]}')),
    ).toEqual({ tone: "error", message: "This amount is too small to convert into shares.", signature: "sig1" });
    expect(describeVaultTxError(new TransactionFailedError("sig2", "transaction expired"))).toMatchObject({
      tone: "error",
      signature: "sig2",
    });
  });

  it("does not claim nothing was sent for an unknown error", () => {
    expect(describeVaultTxError(new Error("socket hang up")).message).toBe(
      "Something went wrong. Check your wallet history before trying again.",
    );
  });
});
