import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createClient, type RedisClientType } from '@keyv/redis';
import { type AppConfig, APP_CONFIG } from '../config/app-config.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** `null` when REDIS_URL is not set: cache and rate limits then stay per instance. */
export type MaybeRedis = RedisClientType | null;

export const InjectRedis = () => Inject(REDIS_CLIENT);

const logger = new Logger('Redis');

function createRedisClient(config: AppConfig): MaybeRedis {
  if (!config.REDIS_URL) {
    logger.warn('REDIS_URL not set: using in-memory cache and rate-limit storage (single instance only).');
    return null;
  }

  const client = createClient({
    url: config.REDIS_URL,
    // Fail fast while disconnected so callers fall back instead of queueing.
    disableOfflineQueue: true,
    // Azure Cache for Redis drops connections idle for 10 minutes.
    pingInterval: 60_000,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries: number) => Math.min(250 * 2 ** Math.min(retries, 5), 10_000),
    },
  }) as RedisClientType;

  let lastError = '';
  client.on('error', (err: Error) => {
    // Log each distinct error once per outage rather than on every retry.
    if (err.message !== lastError) {
      lastError = err.message;
      logger.error(`Redis error: ${err.message}`);
    }
  });
  client.on('ready', () => {
    lastError = '';
    logger.log('Redis connection ready.');
  });

  // Do not block startup on Redis: the app serves traffic with in-memory fallbacks
  // and switches to Redis as soon as the connection is ready.
  client.connect().catch((err: Error) => logger.error(`Redis connect failed: ${err.message}`));
  return client;
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@InjectRedis() private readonly redis: MaybeRedis) {}

  async onApplicationShutdown(): Promise<void> {
    if (!this.redis?.isOpen) return;
    try {
      await this.redis.close();
    } catch {
      this.redis.destroy();
    }
  }
}

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, inject: [APP_CONFIG], useFactory: createRedisClient },
    RedisShutdown,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
