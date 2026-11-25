import { WalletAuthProvider, type AuthProvider } from "@acta-markets/ts-sdk/ws";
import {
  createKeyPairFromPrivateKeyBytes,
  getAddressFromPublicKey,
  getBase58Encoder,
  signBytes,
  type SignatureBytes,
  verifySignature,
} from "@solana/kit";
import type { FillSigner } from "@/lib/trade/fill";

/**
 * Whatever signs for the agent. Bytes in, signature out: a key file, a KMS or a custody API all
 * fit behind it, and nothing above this file ever holds key material.
 *
 * `signMessage` signs the sign-in challenge. A fill is signed with `signTransaction` when the
 * signer has one (a custody API that only signs whole transactions), otherwise with
 * `signMessage` over the transaction's message bytes.
 */
export type ActaSigner = FillSigner;

/** A signer over a local ed25519 key: the first 32 bytes of a Solana CLI key file, or a bare 32-byte key. */
export async function keypairSigner(secret: Uint8Array): Promise<ActaSigner> {
  if (secret.length !== 64 && secret.length !== 32) {
    throw new Error("A key is 32 bytes, or 64 as the Solana CLI writes it");
  }
  const keyPair = await createKeyPairFromPrivateKeyBytes(secret.slice(0, 32));
  const address = await getAddressFromPublicKey(keyPair.publicKey);
  return {
    address,
    signMessage: async (message) => new Uint8Array(await signBytes(keyPair.privateKey, message)),
  };
}

/** The bytes of a key file: a JSON array of 32 or 64 numbers, as `solana-keygen` writes it. */
export function parseKeyFile(text: string): Uint8Array {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The key file is not JSON");
  }
  if (!Array.isArray(parsed) || (parsed.length !== 64 && parsed.length !== 32)
    || !parsed.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    throw new Error("The key file must be a JSON array of 32 or 64 byte values");
  }
  return Uint8Array.from(parsed as number[]);
}

/** Signs the venue's sign-in challenge with the agent's signer. */
export function authProviderFor(signer: ActaSigner): AuthProvider {
  return new WalletAuthProvider({
    publicKeyBase58: signer.address,
    signMessage: (message) => signer.signMessage(message),
  });
}

async function isSignatureOf(address: string, message: Uint8Array, signature: Uint8Array): Promise<boolean> {
  if (signature.length !== 64) return false;
  const key = await crypto.subtle.importKey("raw", new Uint8Array(getBase58Encoder().encode(address)), { name: "Ed25519" }, false, ["verify"]);
  return verifySignature(key, signature as SignatureBytes, message);
}

/**
 * A signer from somewhere else (a KMS, a custody API, a hardware key), held to what it claims.
 * Its shape is checked once, and every message signature it returns is verified against its
 * own address before anything is done with it: a signer that answers with someone else's
 * signature, or with nothing useful, is refused here and not at the venue.
 *
 * A signed transaction is not re-checked here. A fill is verified by the SDK against the quote
 * it was accepted on, and a wallet-paid transaction against what was simulated.
 */
export function checkedSigner(candidate: unknown): ActaSigner {
  const signer = candidate as Partial<ActaSigner> | null;
  if (!signer || typeof signer !== "object") throw new Error("The signer module did not return a signer");
  if (typeof signer.address !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(signer.address)) {
    throw new Error("The signer has no address (base58)");
  }
  if (typeof signer.signMessage !== "function") {
    throw new Error("The signer cannot sign a message, which signing in to the venue needs");
  }
  if (signer.signTransaction !== undefined && typeof signer.signTransaction !== "function") {
    throw new Error("The signer's signTransaction is not a function");
  }
  const address = signer.address;
  const signMessage = signer.signMessage.bind(signer);
  const signTransaction = signer.signTransaction?.bind(signer);
  return {
    address,
    async signMessage(message) {
      const signature = new Uint8Array(await signMessage(message));
      if (!(await isSignatureOf(address, message, signature))) {
        throw new Error("The signer returned a signature that is not this address's over this message");
      }
      return signature;
    },
    ...(signTransaction ? { signTransaction: async (wire: Uint8Array) => new Uint8Array(await signTransaction(wire)) } : {}),
  };
}
