import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../../../src/utils/ttlCache.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TtlCache', () => {
  it('returns a value until its TTL has passed', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', 'value');

    vi.advanceTimersByTime(999);
    expect(cache.get('a')).toBe('value');

    vi.advanceTimersByTime(1);
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the oldest entry when full', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('treats a re-set key as the newest', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);

    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
  });

  describe('getOrLoad', () => {
    it('loads once and serves later calls from the cache', async () => {
      const cache = new TtlCache<string>(1000);
      const load = vi.fn().mockResolvedValue('fresh');

      expect(await cache.getOrLoad('k', load)).toBe('fresh');
      expect(await cache.getOrLoad('k', load)).toBe('fresh');
      expect(load).toHaveBeenCalledOnce();
    });

    it('reloads after expiry', async () => {
      const cache = new TtlCache<string>(1000);
      const load = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');

      await cache.getOrLoad('k', load);
      vi.advanceTimersByTime(1000);

      expect(await cache.getOrLoad('k', load)).toBe('new');
    });

    it('does not cache failures', async () => {
      const cache = new TtlCache<string>(1000);
      const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok');

      await expect(cache.getOrLoad('k', load)).rejects.toThrow('down');
      expect(await cache.getOrLoad('k', load)).toBe('ok');
    });
  });
});
