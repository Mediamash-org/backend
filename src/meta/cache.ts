interface CacheEntry<T> {
  expiresAt: number
  value: T
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>()

  constructor(private readonly defaultTtlMs: number) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs = this.defaultTtlMs): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== undefined) return cached
    const value = await factory()
    this.set(key, value, ttlMs)
    return value
  }
}
