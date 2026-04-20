import Redis from 'ioredis';
import { MemoryCacheStore, type CacheStore } from './store';

class RedisCacheStore implements CacheStore {
  constructor(private client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }

    await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

export async function createCacheStore(
  redisUrl: string,
  options: {
    useMemory?: boolean;
    fallbackToMemory?: boolean;
  } = {}
): Promise<CacheStore> {
  if (options.useMemory) {
    return new MemoryCacheStore();
  }

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  try {
    await client.connect();
    return new RedisCacheStore(client);
  } catch (error) {
    client.disconnect();
    if (options.fallbackToMemory ?? true) {
      console.warn('Redis unavailable, falling back to in-memory cache.', error);
      return new MemoryCacheStore();
    }

    throw new Error('Redis is required but unavailable.', {
      cause: error instanceof Error ? error : undefined
    });
  }
}
