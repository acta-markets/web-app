import { describe, expect, it } from "vitest";
import { getAddressDecoder } from "@solana/kit";
import { computeOrderId, computeSpreadOrderId, encodeOrderPreimage, encodeSpreadOrderPreimage, type SpreadType } from "@acta-markets/ts-sdk/chain";
import fixture from "./fixtures/order-preimage-vectors.json";

type Vector = (typeof fixture)[number] & { args: { upper_strike?: string } };
const decode = (hex: string) => getAddressDecoder().decode(Buffer.from(hex, "hex"));
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("installed SDK matches the shared type-tagged ACTA order vectors", () => {
  it("keeps both type/layout mismatch negatives", () => {
    expect(fixture.filter(v => !v.valid).map(v => v.layout).sort()).toEqual(["physical", "spread"]);
  });
  it.each(fixture as Vector[])("type-tagged bytes and order ID: $name", vector => {
    const v = vector.args;
    const common = { side: v.side as "sell" | "buy", chainId: BigInt(v.chain_id), programId: decode(v.program_id), market: decode(v.market),
      maker: decode(v.maker), taker: decode(v.taker), quantity: BigInt(v.quantity), price: BigInt(v.gross_price),
      validUntil: BigInt(v.valid_until), nonce: BigInt(v.nonce) };
    expect(v.is_taker_buy).toBe(v.side === "buy");
    expect(vector.preimage_hex.startsWith("41435441")).toBe(true);
    const spread = v.position_type === 2 || v.position_type === 3;
    expect(v.upper_strike !== undefined).toBe(spread);
    if (!spread || v.upper_strike === undefined) {
      const terms = { ...common, positionType: v.position_type, strike: BigInt(v.strike) };
      expect(hex(encodeOrderPreimage(terms)) === vector.preimage_hex).toBe(vector.valid);
      expect(hex(computeOrderId(terms)) === vector.order_id).toBe(vector.valid);
      return;
    }
    const terms = { ...common, positionType: v.position_type as SpreadType, lowerStrike: BigInt(v.strike), upperStrike: BigInt(v.upper_strike) };
    expect(hex(encodeSpreadOrderPreimage(terms)) === vector.preimage_hex).toBe(vector.valid);
    expect(hex(computeSpreadOrderId(terms)) === vector.order_id).toBe(vector.valid);
    expect(() => encodeOrderPreimage({ ...common, positionType: v.position_type, strike: terms.lowerStrike })).toThrow();
    if (vector.valid) expect(hex(computeSpreadOrderId({ ...terms, upperStrike: terms.upperStrike + 1n }))).not.toBe(vector.order_id);
  });
});
