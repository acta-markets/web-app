// @vitest-environment node
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getBase58Decoder } from "@solana/kit";
import { checkedSigner, keypairSigner, parseKeyFile } from "./signer";

function freshKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = Buffer.from(privateKey.export({ format: "jwk" }).d!, "base64url");
  const pub = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  return { seed, pub, publicKey };
}

describe("keypairSigner", () => {
  it("signs with the key in the file and names its address", async () => {
    const { seed, pub, publicKey } = freshKey();
    const signer = await keypairSigner(Uint8Array.from([...seed, ...pub]));
    expect(signer.address).toBe(getBase58Decoder().decode(pub));

    const message = new TextEncoder().encode("Acta RFQ Authentication");
    const signature = await signer.signMessage(message);
    expect(signature).toHaveLength(64);
    expect(verify(null, message, publicKey, signature)).toBe(true);
    expect(verify(null, new TextEncoder().encode("another message"), publicKey, signature)).toBe(false);
  });

  it("takes a bare 32-byte key and gives the same address", async () => {
    const { seed, pub } = freshKey();
    expect((await keypairSigner(Uint8Array.from(seed))).address).toBe(getBase58Decoder().decode(pub));
  });

  it("refuses bytes that are not a key", async () => {
    await expect(keypairSigner(new Uint8Array(31))).rejects.toThrow(/32 bytes/);
  });
});

describe("parseKeyFile", () => {
  it("reads the Solana CLI's array", () => {
    expect(parseKeyFile(JSON.stringify(Array.from({ length: 64 }, (_, i) => i)))).toHaveLength(64);
  });

  it("refuses anything else without echoing it", () => {
    for (const text of ["", "{}", "[1,2,3]", JSON.stringify(Array.from({ length: 64 }, () => 256)), '"base58secret"']) {
      expect(() => parseKeyFile(text)).toThrow(/key file/);
    }
    try {
      parseKeyFile('"5Jsecretsecretsecret"');
    } catch (error) {
      expect((error as Error).message).not.toContain("5Jsecret");
    }
  });
});

describe("checkedSigner: a signer from somewhere else", () => {
  const message = new TextEncoder().encode("Acta RFQ Authentication");

  it("passes an honest signer through, with its transaction signing", async () => {
    const { seed } = freshKey();
    const real = await keypairSigner(Uint8Array.from(seed));
    const signer = checkedSigner({ address: real.address, signMessage: real.signMessage, signTransaction: async (wire: Uint8Array) => wire });
    expect(await signer.signMessage(message)).toHaveLength(64);
    expect(await signer.signTransaction!(new Uint8Array([1, 2]))).toEqual(new Uint8Array([1, 2]));
  });

  it("refuses a signature that belongs to another key", async () => {
    const mine = await keypairSigner(Uint8Array.from(freshKey().seed));
    const other = await keypairSigner(Uint8Array.from(freshKey().seed));
    const signer = checkedSigner({ address: mine.address, signMessage: other.signMessage });
    await expect(signer.signMessage(message)).rejects.toThrow(/not this address/);
  });

  it("refuses a signature over a different message, or of the wrong length", async () => {
    const real = await keypairSigner(Uint8Array.from(freshKey().seed));
    const swapped = checkedSigner({ address: real.address, signMessage: () => real.signMessage(new TextEncoder().encode("send everything")) });
    await expect(swapped.signMessage(message)).rejects.toThrow(/not this address/);
    const short = checkedSigner({ address: real.address, signMessage: async () => new Uint8Array(10) });
    await expect(short.signMessage(message)).rejects.toThrow(/not this address/);
  });

  it("refuses what is not a signer, saying which part is missing", () => {
    expect(() => checkedSigner(null)).toThrow(/did not return a signer/);
    expect(() => checkedSigner({ signMessage: async () => new Uint8Array(64) })).toThrow(/no address/);
    expect(() => checkedSigner({ address: "not base58 !" , signMessage: async () => new Uint8Array(64) })).toThrow(/no address/);
    // a signer that can only send transactions cannot sign in
    expect(() => checkedSigner({ address: "11111111111111111111111111111111" })).toThrow(/cannot sign a message/);
    expect(() => checkedSigner({ address: "11111111111111111111111111111111", signMessage: async () => new Uint8Array(64), signTransaction: 1 })).toThrow(/not a function/);
  });
});
