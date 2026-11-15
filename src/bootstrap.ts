import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger as NestLogger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { conditionalGet } from './common/conditional-get.middleware.js';
import { type AppConfig, loadConfig, parseCorsOrigins, parseTrustProxy } from './config/app-config.js';
import { setupSwagger } from './swagger.js';

const EXPOSED_HEADERS = [
  'Link',
  'Location',
  'ETag',
  'X-Total-Count',
  'X-Request-Id',
  'X-Cache',
  'Retry-After',
  ...['', '-burst', '-writes'].flatMap((s) => [
    `X-RateLimit-Limit${s}`,
    `X-RateLimit-Remaining${s}`,
    `X-RateLimit-Reset${s}`,
  ]),
];

/** The landing page built by `vite build` (web/ -> public/), next to dist/ in every layout. */
export const PUBLIC_DIR = resolve(import.meta.dirname, '..', 'public');

/** Builds the fully configured application (used by `main.ts` and the e2e tests). */
export async function createApp(config: AppConfig = loadConfig()): Promise<NestNodeApplication> {
  const app = await NestFactory.create<NestNodeApplication>(
    AppModule,
    new NodeAdapter({ trustProxy: parseTrustProxy(config.TRUST_PROXY) }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.enableVersioning({ type: VersioningType.URI });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(conditionalGet(config.HTTP_CACHE_MAX_AGE_S));
  app.enableCors({
    origin: parseCorsOrigins(config.CORS_ORIGINS),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: 86_400,
  });

  setupSwagger(app, config);
  serveLandingPage(app);

  // Outlive the ingress / load balancer keep-alive so it never reuses a closed socket.
  const server = app.getHttpServer();
  server.keepAliveTimeout = config.KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = config.KEEP_ALIVE_TIMEOUT_MS + 1_000;

  return app;
}

/**
 * Serves the React landing page at `/`. API routes are untouched: anything that isn't a file
 * in public/ falls through to Nest. Hashed bundles are cached for a year; index.html is
 * revalidated on every visit so a deploy shows up at once.
 */
function serveLandingPage(app: NestNodeApplication): void {
  if (!existsSync(join(PUBLIC_DIR, 'index.html'))) {
    new NestLogger('Bootstrap').warn(`No landing page at ${PUBLIC_DIR} (run "pnpm build:web"); serving the API only.`);
    return;
  }
  app.useStaticAssets(PUBLIC_DIR, {
    index: 'index.html',
    redirect: false,
    setHeaders: (res, filePath) => {
      res.setHeader(
        'Cache-Control',
        filePath.includes(`${join('public', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
      );
    },
  });
}
