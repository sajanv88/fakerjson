import { Global, Inject, Module } from '@nestjs/common';
import { type Env, validateEnv } from './env.js';

/** Typed, validated configuration. Inject with `@InjectConfig()`. */
export type AppConfig = Readonly<Env>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export const InjectConfig = () => Inject(APP_CONFIG);

let cached: AppConfig | undefined;

/** Validates `process.env` once; throws with every invalid key listed. */
export function loadConfig(): AppConfig {
  cached ??= Object.freeze(validateEnv(process.env));
  return cached;
}

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}

/** Parses TRUST_PROXY into what NodeAdapter's `trustProxy` option accepts. */
export function parseTrustProxy(value: string): boolean | string[] {
  const v = value.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false' || v === '') return false;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseCorsOrigins(value: string): string[] | '*' {
  const v = value.trim();
  if (v === '*' || v === '') return '*';
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
