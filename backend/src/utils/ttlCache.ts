/**
 * A small in-memory cache where each entry expires after a fixed time.
 * Used for external API responses: they are public, identical for every user,
 * and slightly stale data is harmless (docs/ARCHITECTURE.md §5.5).
 *
 * Per-instance only: entries are lost when the instance stops.
 */
export class TtlCache<V> {
  // A Map remembers insertion order, so its first key is always the oldest entry.
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    /** Caps memory when keys come from users (e.g. one entry per client IP). */
    private readonly maxEntries = Infinity,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    // Re-inserting moves the key to the end, so it counts as the newest.
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /**
   * Returns the cached value, or runs `load` and caches its result.
   * Failures are not cached, so the next request retries the upstream API.
   */
  async getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await load();
    this.set(key, value);
    return value;
  }
}
