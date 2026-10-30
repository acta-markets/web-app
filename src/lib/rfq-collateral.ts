import { ActaWsRequestError } from "@acta-markets/ts-sdk/ws";

export interface CollateralToken {
  symbol: string;
  decimals: number;
}

export const RFQ_REQUEST_FAILED = "Could not request a quote. Please try again.";
export const RFQ_NO_QUOTES = "No quotes arrived within 30 seconds. Try another strike or size.";

function formatAtoms(atoms: bigint, decimals: number): string {
  const digits = atoms.toString().padStart(decimals + 1, "0");
  if (decimals === 0) return digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return digits.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}

export function collateralShortfallMessage(required: bigint, available: bigint, token: CollateralToken): string | null {
  if (available >= required) return null;
  return `Not enough ${token.symbol} to post collateral: need ${formatAtoms(required, token.decimals)}, have ${formatAtoms(available, token.decimals)}`;
}

/** Mirrors shared::collateral::required_collateral, including integer truncation. */
export function requiredCollateralAtoms(
  positionType: "covered_call" | "cash_secured_put",
  quantity: bigint,
  strikes: readonly bigint[],
  underlyingDecimals: number,
  quoteDecimals: number,
): bigint {
  if (positionType === "covered_call") return quantity;
  const maxStrike = strikes.reduce((max, strike) => strike > max ? strike : max, 0n);
  return maxStrike * quantity * 10n ** BigInt(quoteDecimals) /
    (1_000_000_000n * 10n ** BigInt(underlyingDecimals));
}

export function rfqRequestErrorMessage(error: unknown, token: CollateralToken): string {
  const detail = error instanceof Error && error.cause ? error.cause : error;
  const serverError = detail instanceof ActaWsRequestError ? detail.error : detail;
  if (serverError && typeof serverError === "object" && "type" in serverError &&
    serverError.type === "Generic" && "data" in serverError) {
    const data = serverError.data as { code?: string; message?: string };
    if (data.code === "insufficient_collateral" && typeof data.message === "string") {
      const amounts = /required=(\d+), available=(\d+) \(collateral atoms\)/.exec(data.message);
      if (amounts) {
        return collateralShortfallMessage(BigInt(amounts[1]), BigInt(amounts[2]), token) ?? RFQ_REQUEST_FAILED;
      }
    }
  }
  return RFQ_REQUEST_FAILED;
}
