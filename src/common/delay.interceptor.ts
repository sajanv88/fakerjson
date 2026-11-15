import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Observable, from, switchMap } from 'rxjs';
import { type AppConfig, InjectConfig } from '../config/app-config.js';
import { ApiValidationException } from './errors.js';

/**
 * `?delay=<ms>` holds the response back, so front-ends can exercise loading states.
 * Runs before the cache, so cached responses are delayed too.
 */
@Injectable()
export class DelayInterceptor implements NestInterceptor {
  constructor(@InjectConfig() private readonly config: AppConfig) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<NodeRequest>();
    const raw = (req.query as Record<string, unknown> | undefined)?.delay;
    if (raw === undefined || raw === '') return next.handle();

    const value = Array.isArray(raw) ? raw.at(-1) : raw;
    const ms = Number(value);
    const max = this.config.MAX_DELAY_MS;
    if (!Number.isInteger(ms) || ms < 0 || ms > max) {
      throw new ApiValidationException([
        { field: 'delay', message: `must be an integer between 0 and ${max} (milliseconds)` },
      ]);
    }
    if (ms === 0) return next.handle();

    // Stop waiting if the client goes away. (The request's own 'close' fires as soon as
    // its body is read, so listen on the response, which only closes early on abort.)
    const res = context.switchToHttp().getResponse<NodeResponse>();
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.once('close', abort);
    return from(
      sleep(ms, undefined, { signal: controller.signal })
        .catch(() => undefined)
        .finally(() => res.off('close', abort)),
    ).pipe(switchMap(() => next.handle()));
  }
}
