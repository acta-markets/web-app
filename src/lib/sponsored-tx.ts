import {
  fetchGlobalConfigByAddress,
  findGlobalConfigPda,
  flows,
  getActaProgramId,
} from "@acta-markets/ts-sdk/chain";
import {
  getAddressDecoder,
  getBase64Encoder,
  type Address,
  type AddressesByLookupTableAddress,
} from "@solana/kit";
import { getNetwork } from "./network";

type Rpc = Parameters<typeof fetchGlobalConfigByAddress>[0];

const KEEPER_TTL_MS = 30_000;
const LOOKUP_TABLE_PROGRAM = "AddressLookupTab1e1111111111111111111111111";
// u32 state tag, deactivation slot, last extended slot, start index, Option<authority>, padding.
const LOOKUP_TABLE_META_SIZE = 56;
const LOOKUP_TABLE_STATE = 1;
const ACTIVE_TABLE_SLOT = 0xffff_ffff_ffff_ffffn;

const keepers = new Map<string, { expiresAt: number; keeper: Promise<Address> }>();

/**
 * The GlobalConfig hot authority, the only accepted fee payer of a sponsored open. It is read from chain,
 * never from the server, and cached per network and program for a short time.
 */
export function resolveKeeper(rpc: Rpc): Promise<Address> {
  const programId = getActaProgramId();
  const key = `${getNetwork()}:${programId}`;
  const now = Date.now();
  const cached = keepers.get(key);
  if (cached && cached.expiresAt > now) return cached.keeper;
  const keeper = findGlobalConfigPda(programId)
    .then((pda) => fetchGlobalConfigByAddress(rpc, pda, "confirmed"))
    .then(({ account }) => account.hotAuthority);
  const entry = { expiresAt: now + KEEPER_TTL_MS, keeper };
  keepers.set(key, entry);
  keeper.catch(() => {
    if (keepers.get(key) === entry) keepers.delete(key);
  });
  return keeper;
}

function rejectTable(table: Address, reason: string): never {
  throw new flows.VaultIntentError({ kind: "intent", reason: `lookup table ${table} ${reason}` });
}

function tableAddresses(
  table: Address,
  account: { owner: Address; data: readonly [string, "base64"] } | null | undefined,
): Address[] {
  if (!account) throw new flows.VaultIntentError({ kind: "missingLookupTable", table });
  if (account.owner !== LOOKUP_TABLE_PROGRAM) rejectTable(table, "is not an address lookup table");
  const data = getBase64Encoder().encode(account.data[0]);
  if (data.length < LOOKUP_TABLE_META_SIZE || (data.length - LOOKUP_TABLE_META_SIZE) % 32 !== 0) {
    rejectTable(table, "is malformed");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== LOOKUP_TABLE_STATE) rejectTable(table, "is not initialized");
  if (view.getBigUint64(4, true) !== ACTIVE_TABLE_SLOT) rejectTable(table, "is deactivated");
  const decoder = getAddressDecoder();
  return Array.from(
    { length: (data.length - LOOKUP_TABLE_META_SIZE) / 32 },
    (_, index) => decoder.decode(data, LOOKUP_TABLE_META_SIZE + index * 32),
  );
}


/** Width of a Solana shortvec-encoded length at the head of a transaction. */
function shortvecLength(bytes: Uint8Array): { length: number; size: number } {
  let length = 0;
  let size = 0;
  for (;;) {
    const byte = bytes[size];
    if (byte == null) throw new Error("transaction is truncated");
    length |= (byte & 0x7f) << (7 * size);
    size += 1;
    if ((byte & 0x80) === 0) return { length, size };
    if (size > 3) throw new Error("transaction signature count is malformed");
  }
}

/** First index where two byte arrays differ, or -1 when they are equal. */
function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i += 1) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : limit;
}

/** The message bytes of a serialized transaction, skipping its signature slots. */
export function messageBytesOf(serializedTx: Uint8Array): Uint8Array {
  const header = shortvecLength(serializedTx);
  return serializedTx.subarray(header.size + header.length * 64);
}

/**
 * A one-line account of what the wallet signed versus what was served, for the failure
 * message when the verifier refuses. Lengths plus the first differing offset are enough to
 * tell a re-encode from a genuinely different message.
 */
export function describeSignedMessage(servedTx: Uint8Array, signedMessage: Uint8Array): string {
  const header = shortvecLength(servedTx);
  const servedMessage = servedTx.subarray(header.size + header.length * 64);
  const diff = firstDifference(servedMessage, signedMessage);
  if (diff < 0) return `message identical (${servedMessage.length} bytes)`;
  return `served message ${servedMessage.length} bytes, wallet signed ${signedMessage.length} bytes, first difference at byte ${diff}`;
}

/**
 * Writes the wallet's signatures into the served wire, leaving every other byte alone.
 *
 * Wallets return a re-serialised transaction, and that round trip can re-encode the message
 * even though it is logically unchanged. The verifier compares messages byte for byte, so we
 * keep the served message and graft only the signature slots onto it.
 */
export function graftWalletSignatures(
  servedTx: Uint8Array,
  signatures: ReadonlyArray<Uint8Array | null | undefined>,
): Uint8Array {
  const bytes = Uint8Array.from(servedTx);
  const header = shortvecLength(bytes);
  if (header.length !== signatures.length) {
    throw new Error(`wallet signed ${signatures.length} of ${header.length} signatures`);
  }
  let offset = header.size;
  for (const signature of signatures) {
    if (!signature || signature.length !== 64) throw new Error("wallet left a signature empty");
    bytes.set(signature, offset);
    offset += 64;
  }
  return bytes;
}

/**
 * Reads every lookup table a served v0 message names from chain. A table that is missing, not owned by the
 * lookup table program, or deactivating is rejected as a served-transaction mismatch.
 */
export async function resolveLookupTables(rpc: Rpc, txBase64: string): Promise<AddressesByLookupTableAddress> {
  const tables = [...new Set(flows.servedLookupTableKeys(txBase64))];
  if (tables.length === 0) return {};
  const { value } = await rpc
    .getMultipleAccounts(tables, { encoding: "base64", commitment: "confirmed" })
    .send()
    .catch((error: unknown) => {
      throw new Error(`Unable to read lookup tables: ${error instanceof Error ? error.message : String(error)}`);
    });
  return Object.fromEntries(tables.map((table, index) => [table, tableAddresses(table, value[index])]));
}
