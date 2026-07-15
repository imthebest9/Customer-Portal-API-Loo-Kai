import Redis from 'ioredis';
import { ICacheService } from '../../application/ports/cache.port';

/** Distributed cache backed by Redis. Enabled via CACHE_DRIVER=redis. */
export class RedisCacheService implements ICacheService {
  constructor(
    private readonly client: Redis,
    private readonly defaultTtlSeconds: number,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    const payload = JSON.stringify(value);
    if (ttl > 0) {
      await this.client.set(key, payload, 'EX', ttl);
    } else {
      await this.client.set(key, payload);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
