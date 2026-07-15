import NodeCache from 'node-cache';
import { ICacheService } from '../../application/ports/cache.port';

/**
 * In-process cache. Default driver so local development needs no external
 * service (Redis/Docker not required). See {@link RedisCacheService} for the
 * distributed alternative selectable via CACHE_DRIVER=redis.
 */
export class MemoryCacheService implements ICacheService {
  private readonly cache: NodeCache;

  constructor(defaultTtlSeconds: number) {
    this.cache = new NodeCache({ stdTTL: defaultTtlSeconds, useClones: false });
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.cache.get<T>(key);
    return value === undefined ? null : value;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      this.cache.set(key, value, ttlSeconds);
    } else {
      this.cache.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    this.cache.del(key);
  }
}
