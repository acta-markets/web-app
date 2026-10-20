/** Pyth push-oracle shards the backend posts vault feeds to: `NEXT_PUBLIC_PYTH_FEED_SHARDS`, comma-separated, default `0`. */
export function pythFeedShards(value = process.env.NEXT_PUBLIC_PYTH_FEED_SHARDS): number[] {
  if (!value?.trim()) return [0];
  const parts = value.split(",").map((part) => part.trim());
  const shards = parts.map(Number);
  if (parts.some((part) => !/^\d+$/.test(part)) || shards.some((shard) => shard > 0xffff)) {
    throw new Error(`NEXT_PUBLIC_PYTH_FEED_SHARDS must be comma-separated u16 values, got "${value}"`);
  }
  return shards;
}
