import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { type Observable, from, lastValueFrom } from 'rxjs';
import { type AppConfig, InjectConfig } from '../config/app-config.js';
import { DATA_VERSION } from '../data/locales.js';
import { setSpanAttributes, telemetry } from '../telemetry/telemetry.js';

const NO_CACHE = Symbol('NO_CACHE');

/** Opts a GET route out of the response cache (health checks, echo, ...). */
export const NoCache = () => SetMetadata(NO_CACHE, true);

/** Query parameters that never change the payload, so they are left out of the key. */
const isIgnoredParam = (key: string) => key === 'delay' || key.startsWith('_');

/**
 * Two-tier response cache for GET requests: per-pod memory in front of shared Redis.
 * Concurrent misses for one key run the handler once (cache-manager `wrap`), and a
 * failing cache never fails the request.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpCacheInterceptor.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @InjectConfig() private readonly config: AppConfig,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<NodeRequest>();
    const res = http.getResponse<NodeResponse>();
    if (req.method !== 'GET') return next.handle();
    const skip = this.reflector.getAllAndOverride<boolean>(NO_CACHE, [context.getHandler(), context.getClass()]);
    if (skip) {
      // Per-request responses (echo, status, probes) must not be stored by any cache either:
      // the conditional-GET middleware keeps a Cache-Control that is already set.
      res.setHeader('Cache-Control', 'no-store');
      return next.handle();
    }
    if (this.config.CACHE_TTL_MS === 0) return next.handle();
    if (/\bno-cache\b/i.test(req.headers['cache-control'] ?? '')) {
      res.setHeader('X-Cache', 'BYPASS');
      this.record('bypass');
      return next.handle();
    }

    return from(this.resolve(this.keyFor(req), next, res));
  }

  private async resolve(key: string, next: CallHandler, res: NodeResponse): Promise<unknown> {
    let handlerRan = false;
    let computed: { value: unknown } | undefined;
    const load = async () => {
      handlerRan = true;
      const value = await lastValueFrom(next.handle(), { defaultValue: undefined });
      computed = { value };
      return value;
    };

    let value: unknown;
    try {
      value = await this.cache.wrap(key, load, this.config.CACHE_TTL_MS);
    } catch (err) {
      if (computed) value = computed.value; // The cache failed after the handler ran.
      else if (handlerRan) throw err; // The handler itself failed (404, 400, ...).
      else {
        this.logger.warn(`Cache read failed for ${key}: ${(err as Error).message}`);
        value = await load();
      }
    }
    if (!res.headersSent) res.setHeader('X-Cache', handlerRan ? 'MISS' : 'HIT');
    this.record(handlerRan ? 'miss' : 'hit');
    return value;
  }

  private record(result: 'hit' | 'miss' | 'bypass'): void {
    telemetry.cacheLookups.add(1, { result });
    setSpanAttributes({ 'fakerjson.cache': result });
  }

  private keyFor(req: NodeRequest): string {
    const url = req.url ?? '/';
    const qIndex = url.indexOf('?');
    const path = qIndex === -1 ? url : url.slice(0, qIndex);
    const params = new URLSearchParams(qIndex === -1 ? '' : url.slice(qIndex + 1));
    const entries = [...params].filter(([k]) => !isIgnoredParam(k));
    // Stable order: same request, same key, regardless of parameter order.
    entries.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
    const qs = new URLSearchParams(entries).toString();
    return `v${DATA_VERSION}:${path}${qs ? `?${qs}` : ''}`;
  }
}
