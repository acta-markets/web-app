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
