/**
 * Writes the OpenAPI document to disk without starting a server:
 *   pnpm build && pnpm openapi:export [output-path]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.LOG_LEVEL ??= 'silent';
process.env.REDIS_URL = '';

const { createApp } = await import('./bootstrap.js');
const { loadConfig } = await import('./config/app-config.js');
const { buildOpenApiDocument } = await import('./swagger.js');

const app = await createApp();
await app.init();
const document = buildOpenApiDocument(app, loadConfig());
const out = resolve(process.argv[2] ?? 'openapi.json');
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
console.info(`OpenAPI document written to ${out}`);
