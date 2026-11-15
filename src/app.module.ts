import { randomUUID } from 'node:crypto';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type { NodeRequest } from '@nestjs/platform-node';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { createKeyvNonBlocking } from '@keyv/redis';
import { KeyvCacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';
import { LoggerModule } from 'nestjs-pino';
import { DelayInterceptor } from './common/delay.interceptor.js';
import { HttpCacheInterceptor } from './common/http-cache.interceptor.js';
import { PaginationHeadersInterceptor } from './common/pagination.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { APP_CONFIG, type AppConfig, AppConfigModule } from './config/app-config.js';
import { HealthModule } from './health/health.module.js';
import { ResilientThrottlerStorage, ThrottlerStorageModule } from './infra/redis-throttler.storage.js';
import { type MaybeRedis, REDIS_CLIENT, RedisModule } from './infra/redis.module.js';
import { IndexController, UtilitiesController } from './meta/meta.controller.js';
import { ResourcesModule } from './resources/resources.module.js';
import { RouteSpanInterceptor, TelemetryShutdown } from './telemetry/telemetry.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Module({
  imports: [
    AppConfigModule,
    RedisModule,

    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          // JSON logs in production (Container Insights / Loki); readable logs locally.
          ...(config.NODE_ENV === 'development' && {
            transport: { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } },
          }),
          genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const id = typeof incoming === 'string' && /^[\w.-]{1,128}$/.test(incoming) ? incoming : randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
          customLogLevel: (_req, res, err) =>
            err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
          redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
          serializers: {
            req: (req: { id: string; method: string; url: string; remoteAddress?: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              ip: req.remoteAddress,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
        },
      }),
    }),

    // Two tiers: per-pod memory first, shared Redis second. A Redis hit refills memory.
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [APP_CONFIG, REDIS_CLIENT],
      useFactory: (config: AppConfig, redis: MaybeRedis) => {
        const memory = new Keyv({
          store: new KeyvCacheableMemory({
            ttl: config.CACHE_TTL_MS,
            lruSize: config.CACHE_MEMORY_MAX_ITEMS,
          }),
        });
        const stores = [memory];
        if (redis) {
          const shared = createKeyvNonBlocking(redis, { namespace: `${config.REDIS_KEY_PREFIX}:cache` });
          shared.on('error', () => undefined); // Logged by the Redis client; a miss falls back to the handler.
          stores.push(shared);
        }
        return { stores, ttl: config.CACHE_TTL_MS };
      },
    }),

    // Limits are per client IP across the whole API (not per route).
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [APP_CONFIG, ResilientThrottlerStorage],
      useFactory: (config: AppConfig, storage: ResilientThrottlerStorage) => ({
        storage,
        // Per throttler and client, not per route, so limits span the whole API. The name must
        // be in the key: the in-memory storage keeps one "blocked" flag per key.
        generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
        errorMessage: 'Rate limit exceeded.',
        throttlers: [
          { name: 'default', ttl: config.RATE_LIMIT_TTL_MS, limit: config.RATE_LIMIT_LIMIT },
          { name: 'burst', ttl: config.RATE_LIMIT_BURST_TTL_MS, limit: config.RATE_LIMIT_BURST_LIMIT },
          {
            name: 'writes',
            ttl: config.RATE_LIMIT_WRITE_TTL_MS,
            limit: config.RATE_LIMIT_WRITE_LIMIT,
            skipIf: (ctx) => SAFE_METHODS.has(ctx.switchToHttp().getRequest<NodeRequest>().method ?? 'GET'),
          },
        ],
      }),
    }),

    HealthModule,
    ResourcesModule.register(),
  ],
  controllers: [IndexController, UtilitiesController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    TelemetryShutdown,
    // Order matters: the first is outermost. The span is named before anything else runs;
    // delay wraps the rest (cache hits are delayed too); pagination headers sit outside the
    // cache so cached pages get them.
    { provide: APP_INTERCEPTOR, useClass: RouteSpanInterceptor },
    { provide: APP_INTERCEPTOR, useClass: DelayInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PaginationHeadersInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpCacheInterceptor },
  ],
})
export class AppModule {}
