// Load .env (if present) before anything reads the configuration. Existing variables win.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (Kubernetes, Docker).
}

// Imported after .env is loaded: decorators read the configuration at import time.
const { loadConfig } = await import('./config/app-config.js');
const { createApp } = await import('./bootstrap.js');

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.PORT, '0.0.0.0');
app.get((await import('nestjs-pino')).Logger).log(
  `FakerJson listening on port ${config.PORT} (docs at /docs, OpenAPI at /openapi.json)`,
  'Bootstrap',
);
