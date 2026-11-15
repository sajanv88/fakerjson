import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { loadConfig } from '../config/app-config.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    // On SIGTERM, readiness turns 503 for this long before the server closes, so the
    // ingress stops routing new requests before the pod goes away.
    TerminusModule.forRoot({ gracefulShutdownTimeoutMs: loadConfig().SHUTDOWN_DELAY_MS }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
