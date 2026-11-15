import {
  ACTA_CONTRACT_ERROR__VAULT_REQUEST_EXISTS,
  ACTA_CONTRACT_ERROR__VAULT_SHARE_AMOUNT_TOO_SMALL,
} from "@acta-markets/ts-sdk";
import { describe, expect, it } from "vitest";
import { contractErrorCode, describeNotSent, describeSkippedPosition, describeVaultTxError } from "./tx-errors";
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
      new Error(
        `simulation failed: Program log: Instruction: RequestDeposit\nProgram X failed: custom program error: 0x${ACTA_CONTRACT_ERROR__VAULT_REQUEST_EXISTS.toString(16)}`,
      ),
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

  it("says why an option's deposit cannot be taken back when the row was behind the chain", () => {
    // the devnet program's own refusal of a withdrawal on an Open position, as simulated
    expect(describeVaultTxError(new Error("simulation failed: Program X failed: custom program error: 0x3fb")).message).toBe(
      "This option is not funded, so there is no deposit to take back. Nothing was sent.",
    );
  });

  it("keeps the signature when a sent transaction fails or expires", () => {
    expect(
      describeVaultTxError(
        new TransactionFailedError(
          "sig1",
          `transaction failed: {"InstructionError":[0,{"Custom":${ACTA_CONTRACT_ERROR__VAULT_SHARE_AMOUNT_TOO_SMALL}}]}`,
        ),
      ),
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

describe("describeNotSent", () => {
  it("always says nothing was sent, and why", () => {
    const cases: Array<[unknown, RegExp]> = [
      [new Error("HTTP error (429): Too Many Requests"), /^The network is busy/],
      [new Error("User rejected the request"), /^Request declined in your wallet/],
      [new Error("simulation failed: Transfer: insufficient lamports 10, need 20"), /^Not enough balance/],
      [new Error("Wallet changed the simulated transaction"), /^Your wallet changed the transaction before signing it, which/],
      [new Error("Wallet changed the simulated transaction: it added instructions for 11111111111111111111111111111111"), /^Your wallet changed the transaction before signing it \(it added instructions for 1{32}\), which this app does not accept\./],
      [new Error("Wallet returned an unexpected transaction count"), /^Your wallet did not sign every transaction/],
      [new Error("funding requires a matching Open position held by a wallet or Maker"), /^This option is no longer open on chain/],
      [new Error("position not found on chain"), /^This option is not found on chain/],
      // anything else is quoted, so the person and whoever debugs it can see what it was
      [new Error("Cannot read properties of undefined (reading 'serialize')\n    at stack"), /^Could not prepare this: Cannot read properties of undefined \(reading 'serialize'\)\./],
      ["plain string", /^Could not prepare this: plain string\./],
    ];
    for (const [err, start] of cases) {
      const message = describeNotSent(err);
      expect(message).toMatch(start);
      expect(message.endsWith("Nothing was sent.") || message.endsWith("Try again in a moment.")).toBe(true);
      expect(message).toContain("Nothing was sent.");
    }
  });

  it("puts a skipped position's reason in a few words", () => {
    expect(describeSkippedPosition("funding requires a matching Open position held by a wallet or Maker")).toBe("no longer open on chain");
    expect(describeSkippedPosition("market not found on chain")).toBe("not found on chain");
    expect(describeSkippedPosition("funding must be signed by the position holder")).toBe("held by another wallet");
  });
});
