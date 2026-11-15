import { Injectable, Logger, Module } from '@nestjs/common';
import { type ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface.js';
import { type AppConfig, InjectConfig } from '../config/app-config.js';
import { InjectRedis, type MaybeRedis } from './redis.module.js';

/**
 * Fixed-window counter plus block flag, applied atomically.
 * KEYS[1] hits counter, KEYS[2] block flag. ARGV: ttl ms, limit, block duration ms.
 * Returns { totalHits, hitsTtlMs, isBlocked (0|1), blockTtlMs }.
 */
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  local hitsTtl = redis.call('PTTL', KEYS[1])
  if hitsTtl < 0 then hitsTtl = 0 end
  return { hits, hitsTtl, 1, blockTtl }
end
local ttl = tonumber(ARGV[1])
local hits = redis.call('INCR', KEYS[1])
local hitsTtl = redis.call('PTTL', KEYS[1])
if hitsTtl < 0 then
  redis.call('PEXPIRE', KEYS[1], ttl)
  hitsTtl = ttl
end
if hits > tonumber(ARGV[2]) then
  local block = tonumber(ARGV[3])
  redis.call('SET', KEYS[2], '1', 'PX', block)
  return { hits, hitsTtl, 1, block }
end
return { hits, hitsTtl, 0, 0 }
`;

const toSeconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

/**
 * Rate-limit counters shared by every replica through Redis. When Redis is not
 * configured or unreachable, it falls back to per-instance memory so the API keeps
 * serving (fail open) instead of returning 500s.
 */
@Injectable()
export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ResilientThrottlerStorage.name);
  private readonly memory = new ThrottlerStorageService();
  private readonly prefix: string;
  private warned = false;

  constructor(
    @InjectRedis() private readonly redis: MaybeRedis,
    @InjectConfig() config: AppConfig,
  ) {
    this.prefix = `${config.REDIS_KEY_PREFIX}:throttle`;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (this.redis?.isReady) {
      try {
        // `key` is already `<throttler>:<client>`. The hash tag keeps both keys in one slot on Redis Cluster.
        const base = `${this.prefix}:{${key}}`;
        const reply = (await this.redis.eval(INCREMENT_SCRIPT, {
          keys: [`${base}:hits`, `${base}:block`],
          arguments: [String(ttl), String(limit), String(blockDuration)],
        })) as number[];
        const [totalHits = 0, hitsTtl = 0, isBlocked = 0, blockTtl = 0] = reply.map(Number);
        this.warned = false;
        return {
          totalHits,
          timeToExpire: toSeconds(hitsTtl),
          isBlocked: isBlocked === 1,
          timeToBlockExpire: toSeconds(blockTtl),
        };
      } catch (err) {
        this.warnOnce(err);
      }
    }
    return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
  }

  private warnOnce(err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    const message = err instanceof Error ? err.message : String(err);
    this.logger.warn(`Redis rate-limit storage failed, using memory until it recovers: ${message}`);
  }
}

@Module({ providers: [ResilientThrottlerStorage], exports: [ResilientThrottlerStorage] })
export class ThrottlerStorageModule {}
