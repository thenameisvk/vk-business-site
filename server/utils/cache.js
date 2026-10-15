'use strict';

/* =====================================================================
   In-memory cache with TTL, remember(), clear(), and namespace support.
   - Drop-in replacement for anything calling cache.get/set/remember/clear
   - Safe under crashes: never throws, always resolves
   - Auto-cleans expired keys every 60s (no memory leak)
   ===================================================================== */

class MemoryCache {
  constructor({ defaultTTL = 60_000, maxKeys = 500 } = {}) {
    this.store = new Map();          // key → { value, expiresAt }
    this.defaultTTL = defaultTTL;
    this.maxKeys = maxKeys;
    this.hits = 0;
    this.misses = 0;

    // periodic cleanup
    this._sweeper = setInterval(() => this._sweep(), 60_000);
    if (this._sweeper.unref) this._sweeper.unref(); // don't block process exit
  }

  /* ---------- low-level ---------- */
  get(key) {
    const row = this.store.get(key);
    if (!row) { this.misses++; return undefined; }
    if (row.expiresAt && row.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return row.value;
  }

  set(key, value, ttlMs = this.defaultTTL) {
    if (this.store.size >= this.maxKeys) {
      // evict oldest key (Map preserves insertion order)
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    });
    return value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  del(key) {
    return this.store.delete(key);
  }

  /** Alias used across the codebase — never throws, always resolves */
  clear(prefix) {
    if (!prefix) {
      this.store.clear();
      return true;
    }
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
    return true;
  }

  /** Remember pattern: return cached value or compute + cache it */
  async remember(key, ttlMs, producer) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    // producer can be a function or a plain value
    const value = typeof producer === 'function' ? await producer() : producer;
    // don't cache undefined/null to avoid sticky negatives
    if (value !== undefined && value !== null) this.set(key, value, ttlMs);
    return value;
  }

  /* ---------- housekeeping ---------- */
  _sweep() {
    const now = Date.now();
    for (const [k, row] of this.store) {
      if (row.expiresAt && row.expiresAt < now) this.store.delete(k);
    }
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? +(this.hits / total).toFixed(3) : 0,
    };
  }

  /** Manually stop the sweeper (used in tests / shutdown) */
  dispose() {
    clearInterval(this._sweeper);
    this.store.clear();
  }
}

/* Singleton — import this everywhere */
const cache = new MemoryCache({ defaultTTL: 60_000, maxKeys: 500 });

module.exports = cache;
module.exports.MemoryCache = MemoryCache;