import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  type OnApplicationShutdown,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants.js';
import type { NodeRequest } from '@nestjs/platform-node';
import { metrics, trace } from '@opentelemetry/api';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import type { Observable } from 'rxjs';
import { APP_VERSION } from '../version.js';

/**
 * Tracer and instruments. Without a running SDK (no OTLP endpoint) these are the API's
 * no-op implementations, so calling them costs nothing.
 */
export const tracer = trace.getTracer('fakerjson', APP_VERSION);
const meter = metrics.getMeter('fakerjson', APP_VERSION);

export const telemetry = {
  cacheLookups: meter.createCounter('fakerjson.cache.lookups', {
    description: 'Response cache lookups by result (hit, miss, bypass).',
  }),
  rateLimited: meter.createCounter('fakerjson.ratelimit.rejections', {
    description: 'Requests rejected with 429.',
  }),
  materializeDuration: meter.createHistogram('fakerjson.dataset.materialize.duration', {
    description: 'Time to generate a full table for search, filter or sort.',
    unit: 'ms',
  }),
};

/** Marks the current request span (no-op without an SDK). */
export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  trace.getActiveSpan()?.setAttributes(attributes);
}

const joinPath = (...parts: (string | undefined)[]) =>
  `/${parts
    .flatMap((p) => (p ?? '').split('/'))
    .filter(Boolean)
    .join('/')}`;

/**
 * The HTTP instrumentation can't see Nest's routes on the Node adapter, so spans would all be
 * named "GET". This names the server span after the route template (`GET /v1/posts/:id`) and
 * sets `http.route`, which keeps span-name and metric cardinality low.
 */
@Injectable()
export class RouteSpanInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const span = trace.getActiveSpan();
    if (span && context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<NodeRequest>();
      const controller = context.getClass();
      const handler = context.getHandler();
      const version: unknown =
        Reflect.getMetadata(VERSION_METADATA, handler) ?? Reflect.getMetadata(VERSION_METADATA, controller);
      const route = joinPath(
        typeof version === 'string' && version !== (VERSION_NEUTRAL as unknown) ? `v${version}` : undefined,
        Reflect.getMetadata(PATH_METADATA, controller) as string | undefined,
        Reflect.getMetadata(PATH_METADATA, handler) as string | undefined,
      );
      span.updateName(`${req.method} ${route}`);
      span.setAttribute(ATTR_HTTP_ROUTE, route);
      const query = (req.query ?? {}) as Record<string, unknown>;
      if (typeof query.seed === 'string') span.setAttribute('fakerjson.seed', query.seed);
      if (typeof query.locale === 'string') span.setAttribute('fakerjson.locale', query.locale);
    }
    return next.handle();
  }
}

/** Flushes buffered spans and metrics when Nest shuts down (SIGTERM in Kubernetes). */
@Injectable()
export class TelemetryShutdown implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    const sdk = (globalThis as { __otelSdk?: { shutdown(): Promise<void> } }).__otelSdk;
    await sdk?.shutdown().catch(() => undefined);
  }
}
