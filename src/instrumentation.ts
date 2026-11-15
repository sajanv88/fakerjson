/**
 * OpenTelemetry bootstrap. Loaded before the app with `node --import ./dist/instrumentation.js`,
 * so the libraries it instruments (http, redis, pino) are patched before they are imported.
 *
 * Configuration is the standard OTEL_* environment, read by the SDK:
 *   OTEL_EXPORTER_OTLP_ENDPOINT   collector, e.g. http://otel-collector.observability:4318
 *   OTEL_EXPORTER_OTLP_PROTOCOL   http/protobuf (default) or grpc
 *   OTEL_SERVICE_NAME             defaults to "fakerjson"
 *   OTEL_TRACES_SAMPLER(_ARG)     e.g. parentbased_traceidratio / 0.1
 *   OTEL_METRICS_EXPORTER         otlp (default) or none
 *   OTEL_LOGS_EXPORTER            none to keep logs on stdout only (they still carry trace ids)
 *   OTEL_RESOURCE_ATTRIBUTES      e.g. k8s.pod.name=...,deployment.environment.name=prod
 *
 * Without an OTLP endpoint (or with OTEL_SDK_DISABLED=true) nothing is loaded at all.
 */
import { register } from 'node:module';
import { APP_VERSION } from './version.js';

const env = process.env;
const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
const enabled = env.OTEL_SDK_DISABLED !== 'true' && Boolean(endpoint);

if (enabled) {
  // ESM: lets the instrumentations patch modules loaded with `import`.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  env.OTEL_SERVICE_NAME ||= 'fakerjson';
  const versionAttr = `service.version=${APP_VERSION}`;
  env.OTEL_RESOURCE_ATTRIBUTES = env.OTEL_RESOURCE_ATTRIBUTES
    ? `${versionAttr},${env.OTEL_RESOURCE_ATTRIBUTES}` // explicit attributes win (later entries override)
    : versionAttr;

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

  const quiet = /^\/(health|assets|favicon|docs\/)/;
  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        // Noise for a service that does no file or socket work of its own.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          // Probes, static files and Swagger assets are not worth a trace each.
          ignoreIncomingRequestHook: (req) => quiet.test(req.url ?? ''),
        },
        // Logs keep going to stdout as JSON with trace_id/span_id added for correlation.
        '@opentelemetry/instrumentation-pino': { disableLogSending: env.OTEL_LOGS_EXPORTER !== 'otlp' },
      }),
    ],
  });
  sdk.start();
  // Flushed from the app's shutdown hook (see TelemetryShutdown).
  (globalThis as { __otelSdk?: { shutdown(): Promise<void> } }).__otelSdk = sdk;
  console.info(`OpenTelemetry enabled: exporting to ${endpoint} as ${env.OTEL_SERVICE_NAME}`);
}
