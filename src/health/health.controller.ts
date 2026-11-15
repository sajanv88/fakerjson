import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { NoCache } from '../common/http-cache.interceptor.js';
import { InjectRedis, type MaybeRedis } from '../infra/redis.module.js';

/**
 * Kubernetes probes. Redis is reported but never fails readiness: the API keeps
 * serving from memory when Redis is down, so pulling pods would only cause an outage.
 */
@ApiExcludeController()
@SkipThrottle({ default: true, burst: true, writes: true })
@NoCache()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    @InjectRedis() private readonly redis: MaybeRedis,
  ) {}

  /** Liveness: the process is up and the event loop answers. */
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  /** Readiness: ready to take traffic (reports Redis as degraded when unreachable). */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      async () => {
        const indicator = this.indicators.check('redis');
        if (!this.redis) return indicator.up({ mode: 'disabled (in-memory)' });
        if (!this.redis.isReady) return indicator.degraded({ message: 'unreachable, using in-memory fallback' });
        try {
          await this.redis.ping();
          return indicator.up();
        } catch {
          return indicator.degraded({ message: 'ping failed, using in-memory fallback' });
        }
      },
    ]);
  }
}
